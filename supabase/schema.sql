-- Simple Bracket — Supabase schema
-- Paste this into the Supabase SQL editor and run it once.
-- Security model:
--   * Public (anon) clients may SELECT tournaments/participants/matches (read-only bracket view + realtime).
--   * All writes happen server-side with the service-role key, which BYPASSES RLS.
--   * tournament_secrets has NO policies, so the anon key can never read admin tokens.

-- Clean slate (safe to re-run)
drop table if exists matches cascade;
drop table if exists participants cascade;
drop table if exists tournament_secrets cascade;
drop table if exists tournaments cascade;

create table tournaments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  format      text not null check (format in ('single', 'double')),
  status      text not null default 'setup' check (status in ('setup', 'in_progress', 'completed')),
  winner_id   uuid,
  created_at  timestamptz not null default now()
);

create table tournament_secrets (
  tournament_id uuid primary key references tournaments(id) on delete cascade,
  admin_token   text not null
);

create table participants (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name          text not null,
  seed          int,
  created_at    timestamptz not null default now()
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

create index participants_tournament_idx on participants(tournament_id);
create index matches_tournament_idx on matches(tournament_id);

-- Row Level Security ---------------------------------------------------------
alter table tournaments        enable row level security;
alter table tournament_secrets enable row level security;
alter table participants       enable row level security;
alter table matches            enable row level security;

-- Public read access (no write policies => anon cannot write; service role bypasses RLS)
create policy "public read tournaments"  on tournaments  for select using (true);
create policy "public read participants" on participants for select using (true);
create policy "public read matches"      on matches      for select using (true);

-- tournament_secrets: intentionally NO policies => unreadable/unwritable by anon.

-- Realtime: broadcast row changes so the public bracket view updates live.
alter publication supabase_realtime add table matches;
alter publication supabase_realtime add table participants;
alter publication supabase_realtime add table tournaments;
