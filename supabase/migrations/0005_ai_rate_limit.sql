-- AI usage limits for anonymous guests, so "Continue as guest" cannot run up Anthropic costs.
-- Each request to /api/ai/* by a guest records one row in ai_usage. Limits:
--   * 20 requests per guest in the last 1 hour;
--   * 300 requests in the last 24 hours across all anonymous users combined.
-- Signed-up users are not limited and nothing is recorded for them.

create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  route text not null,
  is_anonymous boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_created_idx on public.ai_usage (user_id, created_at);
create index if not exists ai_usage_anon_created_idx on public.ai_usage (is_anonymous, created_at);

-- No policies: the browser roles cannot read or write this table directly.
alter table public.ai_usage enable row level security;

-- Called by the AI routes with the caller's own session. Returns false when the
-- guest is over a limit; otherwise records one unit of usage and returns true.
create or replace function public.consume_ai_quota(p_route text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_anon boolean;
begin
  if v_user is null then
    return false;
  end if;

  select u.is_anonymous into v_anon from auth.users u where u.id = v_user;
  if not found then
    return false;
  end if;
  if not v_anon then
    return true;
  end if;

  -- Serialise guest quota checks so concurrent calls can't overshoot.
  perform pg_advisory_xact_lock(hashtext('public.consume_ai_quota'));

  if (select count(*) from public.ai_usage
       where user_id = v_user and created_at > now() - interval '1 hour') >= 20 then
    return false;
  end if;

  if (select count(*) from public.ai_usage
       where is_anonymous and created_at > now() - interval '24 hours') >= 300 then
    return false;
  end if;

  insert into public.ai_usage (user_id, route, is_anonymous) values (v_user, p_route, true);
  return true;
end;
$$;

revoke all on function public.consume_ai_quota(text) from public;
grant execute on function public.consume_ai_quota(text) to authenticated;
