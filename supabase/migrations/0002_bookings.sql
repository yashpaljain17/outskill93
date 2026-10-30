-- Vet booking requests sent to an n8n workflow.
-- An appointment starts as 'requested'; n8n calls back to confirm (-> scheduled) or decline (-> cancelled).

alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments
  add constraint appointments_status_check check (status in ('requested', 'scheduled', 'done', 'cancelled'));

alter table public.appointments add column if not exists booking_token uuid;
alter table public.appointments add column if not exists clinic jsonb;
create unique index if not exists appointments_booking_token_key on public.appointments (booking_token);

-- Called by /api/booking/callback (anon key). The random token is only known to
-- the server and the n8n workflow, so it acts as the capability to update one row.
create or replace function public.resolve_booking(
  p_token uuid,
  p_status text,
  p_starts_at timestamptz default null,
  p_note text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('confirmed', 'declined') then
    raise exception 'status must be confirmed or declined';
  end if;

  update public.appointments
     set status = case when p_status = 'confirmed' then 'scheduled' else 'cancelled' end,
         starts_at = coalesce(p_starts_at, starts_at),
         notes = case when p_note is null or p_note = '' then notes
                      else concat_ws(E'\n', notes, 'Clinic: ' || p_note) end,
         booking_token = null
   where booking_token = p_token
     and status = 'requested';
  return found;
end;
$$;

revoke all on function public.resolve_booking(uuid, text, timestamptz, text) from public;
grant execute on function public.resolve_booking(uuid, text, timestamptz, text) to anon, authenticated;
