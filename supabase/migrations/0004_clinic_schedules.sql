-- Doctor schedules for partner clinics, slot reservations, and the "options offered" booking state.
-- The n8n booking workflow asks each partner clinic for free slots (clinic_availability),
-- reserves one (reserve_clinic_slot) and reports back (resolve_booking).
-- Run AFTER 0001–0003. Safe to re-run.

-- ===========================================================================
-- 1. Doctors and their weekly hours (Asia/Kolkata)
-- ===========================================================================
create table if not exists public.clinic_doctors (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  name text not null,
  specialties text[] not null default '{}',
  weekdays smallint[] not null default '{1,2,3,4,5,6}', -- 0 = Sunday
  start_time time not null default '09:00',
  end_time time not null default '18:00',
  slot_minutes int not null default 30 check (slot_minutes between 10 and 240),
  created_at timestamptz not null default now()
);
create index if not exists clinic_doctors_clinic_idx on public.clinic_doctors (clinic_id);

alter table public.clinic_doctors enable row level security;
drop policy if exists "clinic doctors read" on public.clinic_doctors;
create policy "clinic doctors read" on public.clinic_doctors for select using (true);

-- Booked doctor slots. No client policies: only the functions below read or write it.
create table if not exists public.clinic_bookings (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  doctor_id uuid not null references public.clinic_doctors (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  appointment_id uuid references public.appointments (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (doctor_id, starts_at)
);
alter table public.clinic_bookings enable row level security;

-- Fictional doctors for the three demo partner clinics (from 0003).
-- Koramangala works afternoons/evenings only, so a morning request there returns options.
insert into public.clinic_doctors (id, clinic_id, name, specialties, weekdays, start_time, end_time)
values
  ('ffffffff-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'Dr. Meera Rao',    '{General check-up,Vaccination}',            '{1,2,3,4,5,6}', '14:00', '20:00'),
  ('ffffffff-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000001', 'Dr. Arjun Pillai', '{Surgery,Emergency}',                       '{1,2,3,4,5}',   '15:00', '20:00'),
  ('ffffffff-0000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000002', 'Dr. Kavya Menon',  '{General check-up,Vaccination,Skin & allergy}', '{1,2,3,4,5,6}', '09:00', '13:00'),
  ('ffffffff-0000-4000-8000-000000000004', 'cccccccc-0000-4000-8000-000000000002', 'Dr. Sameer Khan',  '{Dental,Grooming}',                         '{2,3,4,5,6}',   '10:00', '17:00'),
  ('ffffffff-0000-4000-8000-000000000005', 'cccccccc-0000-4000-8000-000000000003', 'Dr. Neha Kulkarni','{General check-up,Vaccination,Senior pet care}', '{0,1,2,3,4,5,6}', '08:00', '12:00'),
  ('ffffffff-0000-4000-8000-000000000006', 'cccccccc-0000-4000-8000-000000000003', 'Dr. Vikram Shetty','{Orthopaedics}',                            '{1,3,5}',       '16:00', '21:00')
on conflict (id) do nothing;

-- ===========================================================================
-- 2. Appointment states: 'options' = the clinic offered alternative slots
-- ===========================================================================
alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments
  add constraint appointments_status_check
  check (status in ('requested', 'options', 'scheduled', 'done', 'cancelled'));
alter table public.appointments add column if not exists booking_options jsonb;

-- ===========================================================================
-- 3. Free slots for one clinic between two instants
-- ===========================================================================
create or replace function public.clinic_availability(p_clinic uuid, p_from timestamptz, p_to timestamptz)
returns table (doctor_id uuid, doctor_name text, specialties text[], starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select d::date as day
    from generate_series(
      (p_from at time zone 'Asia/Kolkata')::date,
      (p_to at time zone 'Asia/Kolkata')::date,
      interval '1 day'
    ) d
  ),
  slots as (
    select doc.id, doc.name, doc.specialties, doc.slot_minutes,
           ((dy.day + doc.start_time) + make_interval(mins => doc.slot_minutes * g)) at time zone 'Asia/Kolkata' as s
    from public.clinic_doctors doc
    join days dy on extract(dow from dy.day)::int = any (doc.weekdays)
    cross join lateral generate_series(
      0, (extract(epoch from (doc.end_time - doc.start_time)) / 60 / doc.slot_minutes)::int - 1
    ) g
    where doc.clinic_id = p_clinic
  )
  select s.id, s.name, s.specialties, s.s, s.s + make_interval(mins => s.slot_minutes)
  from slots s
  where s.s >= greatest(p_from, now() + interval '1 hour')
    and s.s < p_to
    and not exists (select 1 from public.clinic_bookings b where b.doctor_id = s.id and b.starts_at = s.s)
  order by s.s, s.name
  limit 500;
$$;

revoke all on function public.clinic_availability(uuid, timestamptz, timestamptz) from public;
grant execute on function public.clinic_availability(uuid, timestamptz, timestamptz) to anon, authenticated;

-- ===========================================================================
-- 4. Reserve a slot for a pending booking (the booking token proves the caller is the workflow)
-- ===========================================================================
create or replace function public.reserve_clinic_slot(p_token uuid, p_doctor uuid, p_starts_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appt_id uuid;
  v_doc public.clinic_doctors;
begin
  select id into v_appt_id
  from public.appointments
  where booking_token = p_token and status in ('requested', 'options');
  if v_appt_id is null then
    return false;
  end if;

  -- Retrying the same reservation is fine.
  if exists (select 1 from public.clinic_bookings
             where appointment_id = v_appt_id and doctor_id = p_doctor and starts_at = p_starts_at) then
    return true;
  end if;

  select * into v_doc from public.clinic_doctors where id = p_doctor;
  if not found then
    return false;
  end if;

  if not exists (
    select 1 from public.clinic_availability(v_doc.clinic_id, p_starts_at, p_starts_at + interval '1 minute') a
    where a.doctor_id = p_doctor and a.starts_at = p_starts_at
  ) then
    return false;
  end if;

  insert into public.clinic_bookings (clinic_id, doctor_id, starts_at, ends_at, appointment_id)
  values (v_doc.clinic_id, p_doctor, p_starts_at, p_starts_at + make_interval(mins => v_doc.slot_minutes), v_appt_id)
  on conflict (doctor_id, starts_at) do nothing;
  return found;
end;
$$;

revoke all on function public.reserve_clinic_slot(uuid, uuid, timestamptz) from public;
grant execute on function public.reserve_clinic_slot(uuid, uuid, timestamptz) to anon, authenticated;

-- ===========================================================================
-- 5. Workflow callback: confirmed / declined / options
-- ===========================================================================
drop function if exists public.resolve_booking(uuid, text, timestamptz, text);

create or replace function public.resolve_booking(
  p_token uuid,
  p_status text,
  p_starts_at timestamptz default null,
  p_note text default null,
  p_options jsonb default null,
  p_location text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('confirmed', 'declined', 'options') then
    raise exception 'status must be confirmed, declined or options';
  end if;

  if p_status = 'options' then
    -- Keep the token: the owner's choice goes back to the workflow, which confirms later.
    update public.appointments
       set status = 'options',
           booking_options = coalesce(p_options, '[]'::jsonb),
           notes = case when p_note is null or p_note = '' then notes
                        else concat_ws(E'\n', notes, 'Clinic: ' || p_note) end
     where booking_token = p_token and status = 'requested';
    return found;
  end if;

  update public.appointments
     set status = case when p_status = 'confirmed' then 'scheduled' else 'cancelled' end,
         starts_at = coalesce(p_starts_at, starts_at),
         location = coalesce(nullif(p_location, ''), location),
         notes = case when p_note is null or p_note = '' then notes
                      else concat_ws(E'\n', notes, 'Clinic: ' || p_note) end,
         booking_options = null,
         booking_token = null
   where booking_token = p_token
     and status in ('requested', 'options');
  return found;
end;
$$;

revoke all on function public.resolve_booking(uuid, text, timestamptz, text, jsonb, text) from public;
grant execute on function public.resolve_booking(uuid, text, timestamptz, text, jsonb, text) to anon, authenticated;
