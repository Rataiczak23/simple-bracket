-- Migration: add a shared rate-limit bucket table + helper function.
--
-- Run this in the Supabase SQL editor on an existing deployment to enable the
-- production rate limiter used by the API routes.

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

alter table rate_limit_hits enable row level security;

revoke all on function consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function consume_rate_limit(text, text, integer, integer) to service_role;
