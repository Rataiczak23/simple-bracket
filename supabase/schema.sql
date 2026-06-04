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

create index participants_tournament_idx on participants(tournament_id);
create index matches_tournament_idx on matches(tournament_id);
create index results_user_idx on results(user_id);

-- Row Level Security ---------------------------------------------------------
alter table users              enable row level security;
alter table sessions           enable row level security;
alter table tournaments        enable row level security;
alter table tournament_secrets enable row level security;
alter table participants       enable row level security;
alter table matches            enable row level security;
alter table results            enable row level security;

-- Public read access (no write policies => anon cannot write; service role bypasses RLS)
create policy "public read tournaments"  on tournaments  for select using (true);
create policy "public read participants" on participants for select using (true);
create policy "public read matches"      on matches      for select using (true);

-- users, sessions, tournament_secrets, results: intentionally NO policies =>
-- unreadable/unwritable by anon. The server uses the service-role key for these.

-- Realtime: broadcast row changes so the public bracket view updates live.
alter publication supabase_realtime add table matches;
alter publication supabase_realtime add table participants;
alter publication supabase_realtime add table tournaments;
