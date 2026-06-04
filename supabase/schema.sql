-- Simple Bracket — Supabase schema
-- Paste this into the Supabase SQL editor and run it once.
--
-- NOTE: this DROPS and recreates everything. If you already ran an earlier
-- version and have data you care about, run `supabase/migration-auth-rankings.sql`
-- instead — it adds the auth + rankings pieces without wiping existing tables.
--
-- Security model:
--   * Public (anon) clients may SELECT tournaments/participants/matches (read-only bracket view + realtime).
--   * All writes happen server-side with the service-role key, which BYPASSES RLS.
--   * tournament_secrets, users, sessions, and results have NO anon policies, so
--     the anon key can never read admin tokens, password hashes, or session tokens.
--     The rankings page is rendered server-side with the service-role key.

-- Clean slate (safe to re-run)
drop function if exists consume_rate_limit(text, text, integer, integer);
drop table if exists rate_limit_hits cascade;
drop table if exists results cascade;
drop table if exists matches cascade;
drop table if exists participants cascade;
drop table if exists tournament_secrets cascade;
drop table if exists sessions cascade;
drop table if exists tournaments cascade;
drop table if exists users cascade;

-- Accounts -------------------------------------------------------------------
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,        -- login identifier (stored lowercased)
  name          text not null,               -- real name
  display_name  text not null,               -- public label shown in brackets/rankings
  password_hash text not null,               -- scrypt:salt:hash (never exposed to anon)
  created_at    timestamptz not null default now()
);

create table sessions (
  token       text primary key,              -- random opaque cookie value
  user_id     uuid not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index sessions_user_idx on sessions(user_id);

-- Tournaments ----------------------------------------------------------------
create table tournaments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  format      text not null check (format in ('single', 'double')),
  status      text not null default 'setup' check (status in ('setup', 'in_progress', 'completed')),
  winner_id   uuid,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table tournament_secrets (
  tournament_id uuid primary key references tournaments(id) on delete cascade,
  admin_token   text not null
);

create table participants (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  user_id       uuid references users(id) on delete cascade,
  name          text not null,               -- snapshot of the user's display_name at join time
  seed          int,
  created_at    timestamptz not null default now(),
  unique (tournament_id, user_id)            -- a user joins a given tournament at most once
);

create table matches (
  id                    uuid primary key default gen_random_uuid(),
  tournament_id         uuid not null references tournaments(id) on delete cascade,
  bracket               text not null default 'winners' check (bracket in ('winners', 'losers', 'grand_final')),
  round                 int not null,
  match_number          int not null,
  slot1_participant     uuid,
  slot2_participant     uuid,
  winner_id             uuid,
  next_match_id         uuid,
  next_match_slot       int check (next_match_slot in (1, 2)),
  loser_next_match_id   uuid,
  loser_next_match_slot int check (loser_next_match_slot in (1, 2)),
  is_bye                boolean not null default false,
  created_at            timestamptz not null default now()
);

-- Saved standings, written when a tournament completes -----------------------
create table results (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  placement     int not null,                -- 1 = champion, 2 = runner-up, ...
  points        int not null,                -- placement points awarded
  matches_won   int not null default 0,
  created_at    timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create table rate_limit_hits (
  action       text not null,
  key_hash     text not null,
  window_start timestamptz not null,
  hits         int not null default 0,
  created_at   timestamptz not null default now(),
  primary key (action, key_hash, window_start)
);

create index participants_tournament_idx on participants(tournament_id);
create index matches_tournament_idx on matches(tournament_id);
create index results_user_idx on results(user_id);
create index rate_limit_hits_window_idx on rate_limit_hits(window_start);

create or replace function consume_rate_limit(
  p_action text,
  p_key_hash text,
  p_window_seconds integer,
  p_max_hits integer
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_hits integer;
  v_retry integer;
begin
  if p_window_seconds <= 0 then
    raise exception 'p_window_seconds must be > 0';
  end if;
  if p_max_hits <= 0 then
    raise exception 'p_max_hits must be > 0';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  if random() < 0.02 then
    delete from rate_limit_hits
    where window_start < v_now - interval '1 day';
  end if;

  insert into rate_limit_hits (action, key_hash, window_start, hits)
  values (p_action, p_key_hash, v_window_start, 1)
  on conflict (action, key_hash, window_start)
  do update set hits = rate_limit_hits.hits + 1
  returning hits into v_hits;

  v_retry := greatest(
    ceil(
      extract(epoch from ((v_window_start + make_interval(secs => p_window_seconds)) - v_now))
    )::int,
    1
  );

  return query
  select v_hits <= p_max_hits, greatest(p_max_hits - v_hits, 0), v_retry;
end;
$$;

revoke all on function consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function consume_rate_limit(text, text, integer, integer) to service_role;

-- Row Level Security ---------------------------------------------------------
alter table users              enable row level security;
alter table sessions           enable row level security;
alter table tournaments        enable row level security;
alter table tournament_secrets enable row level security;
alter table participants       enable row level security;
alter table matches            enable row level security;
alter table results            enable row level security;
alter table rate_limit_hits    enable row level security;

-- Public read access (no write policies => anon cannot write; service role bypasses RLS)
create policy "public read tournaments"  on tournaments  for select using (true);
create policy "public read participants" on participants for select using (true);
create policy "public read matches"      on matches      for select using (true);

-- users, sessions, tournament_secrets, results, rate_limit_hits: intentionally NO policies =>
-- unreadable/unwritable by anon. The server uses the service-role key for these.

-- Realtime: broadcast row changes so the public bracket view updates live.
alter publication supabase_realtime add table matches;
alter publication supabase_realtime add table participants;
alter publication supabase_realtime add table tournaments;
