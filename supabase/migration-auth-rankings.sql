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

-- RLS: new tables are server-only (no anon policies). ------------------------
alter table users    enable row level security;
alter table sessions enable row level security;
alter table results  enable row level security;
