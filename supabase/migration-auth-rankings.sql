-- Migration: add accounts (username/password — login by email), link
-- participants to accounts, and save tournament standings for power rankings.
--
-- Run this in the Supabase SQL editor if you ALREADY applied schema.sql and
-- want to keep your existing tournaments. It is additive and idempotent.

-- Accounts -------------------------------------------------------------------
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  name          text not null,
  display_name  text not null,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table if not exists sessions (
  token       text primary key,
  user_id     uuid not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index if not exists sessions_user_idx on sessions(user_id);

-- Link existing tables to accounts -------------------------------------------
alter table tournaments  add column if not exists created_by uuid references users(id) on delete set null;
alter table participants add column if not exists user_id    uuid references users(id) on delete cascade;

-- One account per tournament. (Pre-existing guest rows have user_id = null and
-- are not constrained; new joins all carry a user_id.)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'participants_tournament_id_user_id_key'
  ) then
    alter table participants add constraint participants_tournament_id_user_id_key
      unique (tournament_id, user_id);
  end if;
end $$;

-- Saved standings ------------------------------------------------------------
create table if not exists results (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  placement     int not null,
  points        int not null,
  matches_won   int not null default 0,
  created_at    timestamptz not null default now(),
  unique (tournament_id, user_id)
);
create index if not exists results_user_idx on results(user_id);

create table if not exists rate_limit_hits (
  action       text not null,
  key_hash     text not null,
  window_start timestamptz not null,
  hits         int not null default 0,
  created_at   timestamptz not null default now(),
  primary key (action, key_hash, window_start)
);
create index if not exists rate_limit_hits_window_idx on rate_limit_hits(window_start);

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

-- RLS: new tables are server-only (no anon policies). ------------------------
alter table users    enable row level security;
alter table sessions enable row level security;
alter table results  enable row level security;
alter table rate_limit_hits enable row level security;
