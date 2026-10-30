-- PawPal master data: vet clinic directory, demo users, their pets and records,
-- and community Q&A. Safe to re-run: every insert skips rows that already exist.
-- Run AFTER 0001_init.sql and 0002_bookings.sql.
--
-- Demo logins (email + password) for the app's own test accounts:
--   aarav@pawpal.demo, priya@pawpal.demo, rohan@pawpal.demo, ananya@pawpal.demo, kabir@pawpal.demo
--   password for all: PawPalDemo#2026

-- ===========================================================================
-- 1. Clinic directory (public read; managed from the SQL editor)
-- ===========================================================================
create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  osm_id text unique,                       -- OpenStreetMap id, e.g. node/123, when the clinic is on the map
  name text not null,
  address text,
  area text,
  city text not null default 'Bengaluru',
  lat double precision not null,
  lon double precision not null,
  phone text,
  email text,
  website text,
  opening_hours text,
  services text[] not null default '{}',
  emergency boolean not null default false,
  online_booking boolean not null default false, -- partner clinics that accept PawPal booking requests
  booking_email text,                            -- where the n8n workflow sends requests
  booking_whatsapp text,
  created_at timestamptz not null default now()
);
create index if not exists clinics_geo_idx on public.clinics (lat, lon);

alter table public.clinics enable row level security;
drop policy if exists "clinics read" on public.clinics;
create policy "clinics read" on public.clinics for select using (true);

-- Real clinics from OpenStreetMap (© OpenStreetMap contributors, ODbL).
insert into public.clinics (osm_id, name, address, area, lat, lon, phone, email, website, opening_hours)
values
  ('node/4583523289', 'Anu Pet Clinic', '3 2nd A Main, Indiranagar, Bengaluru', 'Indiranagar', 13.0192963, 77.6336990, '+91 98440 04905', null, null, null),
  ('node/2767232789', 'BBMP Veterinary Hospital', 'Police Station Road, Dayanand Nagara, Bengaluru', 'Dayanand Nagara', 12.9900350, 77.5643749, null, null, null, null),
  ('node/11296908431', 'BTM Vet Clinic', '7th Cross Road, Viswamanava Kuvempu Ward, Bengaluru', 'Viswamanava Kuvempu Ward', 12.9134477, 77.6054350, null, null, null, null),
  ('node/14318281526', 'BTM Vet Clinic', '296 7th Main Road, Viswamanava Kuvempu Ward, Bengaluru', 'Viswamanava Kuvempu Ward', 12.9137745, 77.6060837, null, null, null, null),
  ('node/3897575411', 'Bengalore Veterinary Hospital', 'Jeevanahalli Main Road, Jeevanahalli, Bengaluru', 'Jeevanahalli', 12.9948763, 77.6282673, null, null, null, null),
  ('node/9583428973', 'Cessna Lifeline Veterinary Hospital', 'Dr. CV Raman Road, Sadashivanagar, Bengaluru', 'Sadashivanagar', 13.0145081, 77.5742617, null, null, null, null),
  ('node/3401269524', 'Cessna Lifeline Veterinary care clinic', '4th Main Road, Domluru, Bengaluru', 'Domluru', 12.9565190, 77.6425504, null, null, null, null),
  ('way/803346375', 'Government Veterinary Hospital', '2nd Main Road, Madiwala, Bengaluru', 'Madiwala', 12.9248121, 77.6174908, null, null, null, null),
  ('node/5469008922', 'Government Veterinary Hospital', '1st B Cross Road, Domluru, Bengaluru', 'Domluru', 12.9604789, 77.6350036, null, null, null, null),
  ('node/1469249217', 'Government Veterinary Hospital', 'Prince of Wales Road, Jayamahal, Bengaluru', 'Jayamahal', 12.9917256, 77.5991714, null, null, null, null),
  ('way/346729228', 'Hope Veterinary Clinic', 'Horamavu Agara Road, Horamavu, Bengaluru', 'Horamavu', 13.0378807, 77.6502896, null, null, null, null),
  ('node/9655459411', 'Indira pet clinic', 'Sai Baba Mandira Road, Indiranagar, Bengaluru', 'Indiranagar', 12.9726123, 77.6379008, null, null, null, null),
  ('node/3221380824', 'Pampapathi Veterinary Centre', 'Outer Ring Road, Sarakki, Bengaluru', 'Sarakki', 12.9065734, 77.5823503, null, null, null, null),
  ('node/10073475701', 'Pet Zone Pet Clinic', '437 8th Main, Marenahalli South, Bengaluru', 'Marenahalli South', 12.9335751, 77.6267634, '08041217299', null, null, null),
  ('node/12366563178', 'Precise Pet Clinic', '8th Cross Road, New Thippasandra, Bengaluru', 'New Thippasandra', 12.9685315, 77.6514828, null, null, null, null),
  ('node/7146671685', 'Sunil Pet Clinic', 'Nagarabhavi Road, Marenahalli West, Bengaluru', 'Marenahalli West', 12.9726701, 77.5284772, null, null, null, null),
  ('node/12135160553', 'Veterinary Dispensary', 'SH35, Belathur, Bengaluru', 'Belathur', 12.9958340, 77.7576041, null, null, null, null),
  ('node/3010283557', 'Veterinary Hospital', 'Rashtriya Vidyalaya Road, Byrasandra, Bengaluru', 'Byrasandra', 12.9319134, 77.5804120, null, null, null, null),
  ('way/688356352', 'Veterinary Hospital', 'Ananta Nair Road, Hoysala Nagara Central, Bengaluru', 'Hoysala Nagara Central', 12.9790090, 77.6264693, null, null, null, null),
  ('way/260994096', 'Veterinary Hospital', 'Ganga Nagar Flyover, Bhoopasandra, Bengaluru', 'Bhoopasandra', 13.0283388, 77.5844332, null, null, null, null),
  ('way/1083566603', 'Veterinary Superspeciality Hospital', 'Thimmaiah Road, Jayamahal, Bengaluru', 'Jayamahal', 12.9915406, 77.5994155, null, null, null, null)
on conflict (osm_id) do nothing;

-- Fictional partner clinics that accept online booking, for demoing the n8n flow.
insert into public.clinics (id, name, address, area, lat, lon, phone, opening_hours, services, emergency, online_booking, booking_email)
values
  ('cccccccc-0000-4000-8000-000000000001', 'PawPal Partner Vet (Demo) · Koramangala', '80 Feet Road, 4th Block, Koramangala, Bengaluru', 'Koramangala',
   12.9352, 77.6245, '+91 80 0000 0001', '24/7', '{General check-up,Vaccination,Surgery,Emergency,Dental}', true, true, 'bookings+koramangala@example.com'),
  ('cccccccc-0000-4000-8000-000000000002', 'PawPal Partner Vet (Demo) · Indiranagar', '100 Feet Road, HAL 2nd Stage, Indiranagar, Bengaluru', 'Indiranagar',
   12.9719, 77.6412, '+91 80 0000 0002', 'Mo-Sa 09:00-20:00', '{General check-up,Vaccination,Grooming,Skin & allergy}', false, true, 'bookings+indiranagar@example.com'),
  ('cccccccc-0000-4000-8000-000000000003', 'PawPal Partner Vet (Demo) · Jayanagar', '11th Main Road, 4th Block, Jayanagar, Bengaluru', 'Jayanagar',
   12.9299, 77.5824, '+91 80 0000 0003', 'Mo-Su 08:00-21:00', '{General check-up,Vaccination,Orthopaedics,Senior pet care}', false, true, 'bookings+jayanagar@example.com')
on conflict (id) do nothing;

-- ===========================================================================
-- 2. Demo users (email confirmed; profiles are created by the on_auth_user_created trigger)
-- ===========================================================================
with demo (id, email, name) as (
  values
    ('aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'aarav@pawpal.demo', 'Aarav Sharma'),
    ('aaaaaaaa-0000-4000-8000-000000000002'::uuid, 'priya@pawpal.demo', 'Priya Nair'),
    ('aaaaaaaa-0000-4000-8000-000000000003'::uuid, 'rohan@pawpal.demo', 'Rohan Mehta'),
    ('aaaaaaaa-0000-4000-8000-000000000004'::uuid, 'ananya@pawpal.demo', 'Ananya Iyer'),
    ('aaaaaaaa-0000-4000-8000-000000000005'::uuid, 'kabir@pawpal.demo', 'Kabir Singh')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', d.id, 'authenticated', 'authenticated', d.email,
       crypt('PawPalDemo#2026', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', d.name),
       now(), now(), '', '', '', ''
from demo d
where not exists (select 1 from auth.users u where u.id = d.id or u.email = d.email);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u
where u.id::text like 'aaaaaaaa-0000-4000-8000-%'
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

-- ===========================================================================
-- 3. Pets
-- ===========================================================================
insert into public.pets (id, owner_id, name, species, breed, sex, birth_date, weight_kg, allergies, notes)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Bruno', 'dog', 'Golden Retriever', 'male',   date '2022-08-14', 29.0, 'Chicken', 'Loves fetch. Pulls on the leash near other dogs.'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'Coco',  'dog', 'Beagle',           'female', date '2023-03-02', 11.2, null,      'Food-motivated, watch portion sizes.'),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000002', 'Luna',  'cat', 'Indian Shorthair', 'female', date '2021-05-10', 4.2,  null,      'Indoor cat, spayed.'),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000002', 'Simba', 'cat', 'Persian',          'male',   date '2019-11-20', 5.1,  null,      'On a kidney-support diet. Needs daily brushing.'),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-000000000003', 'Max',   'dog', 'Labrador Retriever','male',  date '2016-02-01', 34.0, null,      'Senior with hip arthritis — short, gentle walks.'),
  ('bbbbbbbb-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-000000000003', 'Thumper','rabbit','Holland Lop',   'male',   date '2024-01-15', 1.8,  null,      'Free-roams the living room in the evening.'),
  ('bbbbbbbb-0000-4000-8000-000000000007', 'aaaaaaaa-0000-4000-8000-000000000004', 'Bella', 'dog', 'Indie',            'female', date '2020-07-07', 18.0, 'Beef',    'Rescued in 2021. Nervous around fireworks.'),
  ('bbbbbbbb-0000-4000-8000-000000000008', 'aaaaaaaa-0000-4000-8000-000000000004', 'Kiwi',  'bird','Budgerigar',       'female', date '2023-09-01', 0.04, null,      'Chatty in the mornings.'),
  ('bbbbbbbb-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-000000000005', 'Rocky', 'dog', 'German Shepherd',  'male',   current_date - 120, 14.0, null,   'Puppy — house training in progress.')
on conflict (id) do nothing;

-- ===========================================================================
-- 4. Routines (days: 0 = Sunday)
-- ===========================================================================
insert into public.routines (owner_id, pet_id, kind, title, times, days, amount, notes)
select p.owner_id, p.id, v.kind, v.title, v.times::text[], v.days::smallint[], v.amount, v.notes
from (values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'feeding',    'Breakfast',              '{08:00}',             '{0,1,2,3,4,5,6}', '1.5 cups lamb kibble', null),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'feeding',    'Dinner',                 '{19:30}',             '{0,1,2,3,4,5,6}', '1.5 cups lamb kibble', null),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'walk',       'Morning walk',           '{07:00}',             '{0,1,2,3,4,5,6}', '40 min', 'Cubbon Park dog area on weekends'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'walk',       'Evening walk',           '{18:30}',             '{0,1,2,3,4,5,6}', '30 min', null),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'grooming',   'Brush coat',             '{20:00}',             '{0,3}',           null, 'Undercoat rake in shedding season'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'feeding',    'Meals',                  '{08:00,18:00}',       '{0,1,2,3,4,5,6}', '3/4 cup', 'Use the slow-feeder bowl'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'walk',       'Sniff walk',             '{07:30,18:30}',       '{0,1,2,3,4,5,6}', '30 min', null),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'feeding',    'Wet food',               '{08:00,20:00}',       '{0,1,2,3,4,5,6}', '1 pouch', null),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'play',       'Wand toy play',          '{21:00}',             '{0,1,2,3,4,5,6}', '15 min', null),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'feeding',    'Renal diet',             '{08:00,14:00,20:00}', '{0,1,2,3,4,5,6}', '1/3 can', 'Fresh water fountain refilled'),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'grooming',   'Daily brushing',         '{21:00}',             '{0,1,2,3,4,5,6}', '10 min', null),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'medication', 'Joint supplement',       '{08:00}',             '{0,1,2,3,4,5,6}', '1 chew', 'Glucosamine + omega-3'),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'medication', 'Carprofen',              '{19:00}',             '{0,1,2,3,4,5,6}', '75 mg with food', 'Prescribed for arthritis'),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'walk',       'Gentle walk',            '{07:00,18:00}',       '{0,1,2,3,4,5,6}', '15 min', 'Avoid stairs'),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'feeding',    'Senior kibble',          '{08:30,19:00}',       '{0,1,2,3,4,5,6}', '2 cups', null),
  ('bbbbbbbb-0000-4000-8000-000000000006', 'feeding',    'Hay and greens',         '{08:00,19:00}',       '{0,1,2,3,4,5,6}', 'Unlimited hay, 1 cup greens', null),
  ('bbbbbbbb-0000-4000-8000-000000000007', 'feeding',    'Meals',                  '{08:30,19:30}',       '{0,1,2,3,4,5,6}', '1.25 cups fish-based kibble', null),
  ('bbbbbbbb-0000-4000-8000-000000000007', 'walk',       'Walk',                   '{07:00,18:00}',       '{0,1,2,3,4,5,6}', '30 min', null),
  ('bbbbbbbb-0000-4000-8000-000000000007', 'training',   'Confidence training',    '{17:30}',             '{1,3,5}',         '10 min', 'Desensitise to loud sounds'),
  ('bbbbbbbb-0000-4000-8000-000000000008', 'feeding',    'Seeds and fresh veg',    '{08:00}',             '{0,1,2,3,4,5,6}', '1 tbsp seed mix', 'Change water daily'),
  ('bbbbbbbb-0000-4000-8000-000000000009', 'feeding',    'Puppy meals',            '{07:00,12:00,17:00,21:00}', '{0,1,2,3,4,5,6}', '1/2 cup puppy food', null),
  ('bbbbbbbb-0000-4000-8000-000000000009', 'training',   'Potty break',            '{06:30,10:00,14:00,18:00,22:00}', '{0,1,2,3,4,5,6}', null, 'Reward within 3 seconds'),
  ('bbbbbbbb-0000-4000-8000-000000000009', 'training',   'Sit / stay practice',    '{16:00}',             '{0,1,2,3,4,5,6}', '5 min', null)
) as v(pet_id, kind, title, times, days, amount, notes)
join public.pets p on p.id = v.pet_id::uuid
where not exists (select 1 from public.routines r where r.pet_id = p.id and r.title = v.title);

-- ===========================================================================
-- 5. Vaccinations (mix of overdue, due soon and up to date)
-- ===========================================================================
insert into public.vaccinations (owner_id, pet_id, vaccine, given_on, next_due, clinic, notes)
select p.owner_id, p.id, v.vaccine, v.given_on, v.next_due, v.clinic, v.notes
from (values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'Rabies',              current_date - 356, current_date + 9,   'Cessna Lifeline Veterinary care clinic', null),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'DHPPi',               current_date - 200, current_date + 165, 'Cessna Lifeline Veterinary care clinic', '5-in-1 booster'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Rabies',              current_date - 300, current_date + 65,  'Pet Zone Pet Clinic', null),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Leptospirosis',       current_date - 380, current_date - 15,  'Pet Zone Pet Clinic', 'Overdue — book soon'),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'FVRCP',               current_date - 340, current_date + 25,  'Anu Pet Clinic', null),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'FVRCP',               current_date - 120, current_date + 245, 'Anu Pet Clinic', null),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'Rabies',              current_date - 400, current_date - 35,  'Anu Pet Clinic', null),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'Rabies',              current_date - 90,  current_date + 275, 'Government Veterinary Hospital', null),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'Kennel cough',        current_date - 330, current_date + 35,  'Government Veterinary Hospital', null),
  ('bbbbbbbb-0000-4000-8000-000000000006', 'RHDV2',               current_date - 180, current_date + 185, 'Precise Pet Clinic', null),
  ('bbbbbbbb-0000-4000-8000-000000000007', 'Rabies',              current_date - 360, current_date + 5,   'Indira pet clinic', null),
  ('bbbbbbbb-0000-4000-8000-000000000007', 'DHPPi',               current_date - 60,  current_date + 305, 'Indira pet clinic', null),
  ('bbbbbbbb-0000-4000-8000-000000000009', 'DHPPi (puppy dose 2)', current_date - 25, current_date + 3,   'Hope Veterinary Clinic', 'Third dose then rabies'),
  ('bbbbbbbb-0000-4000-8000-000000000009', 'Rabies',              null,               current_date + 24,  null, 'First rabies shot at 16 weeks')
) as v(pet_id, vaccine, given_on, next_due, clinic, notes)
join public.pets p on p.id = v.pet_id::uuid
where not exists (select 1 from public.vaccinations x where x.pet_id = p.id and x.vaccine = v.vaccine);

-- ===========================================================================
-- 6. Appointments
-- ===========================================================================
insert into public.appointments (owner_id, pet_id, kind, title, starts_at, location, notes, status)
select p.owner_id, p.id, v.kind, v.title, ((current_date + v.day_offset) + v.at_time) at time zone 'Asia/Kolkata', v.location, v.notes, v.status
from (values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'vet',      'Rabies booster',          9,   time '10:30', 'Cessna Lifeline Veterinary care clinic, Domluru', null, 'scheduled'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'grooming', 'Bath and nail trim',      4,   time '16:00', 'Wag Spa, Koramangala', null, 'scheduled'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'vet',      'Leptospirosis vaccine',   2,   time '11:00', 'Pet Zone Pet Clinic, Marenahalli', 'Overdue booster', 'scheduled'),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'vet',      'Kidney blood panel',      6,   time '09:30', 'Anu Pet Clinic, Indiranagar', 'Fast for 8 hours before', 'scheduled'),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'vet',      'Arthritis review',        -20, time '17:00', 'Government Veterinary Hospital, Madiwala', 'Continue carprofen, recheck in 3 months', 'done'),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'other',    'Hydrotherapy session',    3,   time '08:00', 'Paws Rehab, HSR Layout', null, 'scheduled'),
  ('bbbbbbbb-0000-4000-8000-000000000007', 'training', 'Fear-free training class', 1,  time '18:00', 'Happy Tails Academy, Indiranagar', null, 'scheduled'),
  ('bbbbbbbb-0000-4000-8000-000000000009', 'vet',      'Puppy vaccine — dose 3',  3,   time '12:00', 'Hope Veterinary Clinic, Horamavu', null, 'scheduled')
) as v(pet_id, kind, title, day_offset, at_time, location, notes, status)
join public.pets p on p.id = v.pet_id::uuid
where not exists (select 1 from public.appointments a where a.pet_id = p.id and a.title = v.title);

-- ===========================================================================
-- 7. Community Q&A
-- ===========================================================================
insert into public.questions (id, author_id, title, body, species, tags, created_at)
values
  ('dddddddd-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002',
   'My Persian cat is drinking a lot more water than usual',
   'Simba is 6 and has started emptying his water fountain twice a day. He is eating normally. Should I be worried?',
   'cat', '{health,kidney,senior}', now() - interval '3 days'),
  ('dddddddd-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000005',
   'How long until a German Shepherd puppy is house trained?',
   'Rocky is 4 months old. We take him out every 3–4 hours but still get 1–2 accidents a day. Any tips?',
   'dog', '{puppy,training}', now() - interval '2 days'),
  ('dddddddd-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000003',
   'Best low-impact exercise for a senior Lab with arthritis?',
   'Max is 10 with hip arthritis. Walks over 20 minutes leave him stiff. What else can we do to keep him fit?',
   'dog', '{senior,arthritis,exercise}', now() - interval '30 hours'),
  ('dddddddd-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000001',
   'Dog-friendly parks in Bangalore where off-leash is allowed?',
   'Looking for places around Koramangala or Indiranagar where Bruno can run off-leash safely.',
   'dog', '{bangalore,parks,exercise}', now() - interval '20 hours'),
  ('dddddddd-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-000000000004',
   'Is it normal for a budgie to sleep a lot during the day?',
   'Kiwi naps for an hour or two in the afternoon with fluffed feathers. Eating and chirping normally otherwise.',
   'bird', '{behaviour,health}', now() - interval '6 hours')
on conflict (id) do nothing;

insert into public.answers (id, author_id, question_id, body, created_at)
values
  ('eeeeeeee-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000001',
   'Increased thirst in an older cat is worth a vet visit soon — it can point to kidney issues, diabetes or thyroid problems. Ask for a blood panel and urine test.',
   now() - interval '70 hours'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000001',
   'Our cat had the same and it was early kidney disease. Caught early, a renal diet made a big difference. Measure how much he drinks for a few days to show the vet.',
   now() - interval '60 hours'),
  ('eeeeeeee-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000002',
   'Go out right after waking, eating and play, not just on a timer. Reward outside immediately, and clean accidents with an enzyme cleaner. Most GSDs click by 5–6 months.',
   now() - interval '40 hours'),
  ('eeeeeeee-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000003',
   'Swimming or hydrotherapy is great for arthritic dogs — no impact on the joints. Also split walks into 2–3 short ones and keep him lean.',
   now() - interval '26 hours'),
  ('eeeeeeee-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000004',
   'Cubbon Park has a fenced dog park area near the Bal Bhavan side, busiest early morning. Check PawPal''s Nearby tab for others close to you.',
   now() - interval '15 hours')
on conflict (id) do nothing;

insert into public.answer_votes (user_id, answer_id)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000001'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'eeeeeeee-0000-4000-8000-000000000001'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'eeeeeeee-0000-4000-8000-000000000003'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'eeeeeeee-0000-4000-8000-000000000003'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'eeeeeeee-0000-4000-8000-000000000004'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000005')
on conflict do nothing;

update public.questions set accepted_answer_id = 'eeeeeeee-0000-4000-8000-000000000001'
 where id = 'dddddddd-0000-4000-8000-000000000001' and accepted_answer_id is null;
update public.questions set accepted_answer_id = 'eeeeeeee-0000-4000-8000-000000000003'
 where id = 'dddddddd-0000-4000-8000-000000000002' and accepted_answer_id is null;
