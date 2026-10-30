-- PawPal: pet care companion schema
-- Run in Supabase SQL editor (or `supabase db push`).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user, auto-created)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, 'Guest'), '@', 1), 'Guest')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Pets and care records (all owner-scoped)
-- ---------------------------------------------------------------------------
create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  species text not null default 'dog',
  breed text,
  sex text,
  birth_date date,
  weight_kg numeric(6, 2),
  photo_url text,
  allergies text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pet_id uuid not null references public.pets (id) on delete cascade,
  kind text not null default 'other'
    check (kind in ('feeding', 'walk', 'medication', 'grooming', 'play', 'training', 'other')),
  title text not null,
  times text[] not null default '{}',            -- "HH:MM" 24h
  days smallint[] not null default '{0,1,2,3,4,5,6}', -- 0 = Sunday
  amount text,
  notes text,
  active boolean not null default true,
  ends_on date,
  created_at timestamptz not null default now()
);

create table if not exists public.routine_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id uuid not null references public.routines (id) on delete cascade,
  pet_id uuid not null references public.pets (id) on delete cascade,
  log_date date not null default current_date,
  slot text not null default '',
  done_at timestamptz not null default now(),
  unique (routine_id, log_date, slot)
);

create table if not exists public.vaccinations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pet_id uuid not null references public.pets (id) on delete cascade,
  vaccine text not null,
  given_on date,
  next_due date,
  clinic text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pet_id uuid not null references public.pets (id) on delete cascade,
  kind text not null default 'vet' check (kind in ('vet', 'grooming', 'training', 'other')),
  title text not null,
  starts_at timestamptz not null,
  location text,
  notes text,
  status text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled')),
  created_at timestamptz not null default now()
);

-- AI-generated (then user-edited) checklists
create table if not exists public.checklists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pet_id uuid references public.pets (id) on delete cascade,
  title text not null,
  summary text,
  source_text text,
  safety_notes text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  checklist_id uuid not null references public.checklists (id) on delete cascade,
  position int not null default 0,
  title text not null,
  details text,
  frequency text,
  time_of_day text,
  category text,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Community Q&A (public read, author write)
-- ---------------------------------------------------------------------------
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  species text,
  tags text[] not null default '{}',
  ai_answer text,
  accepted_answer_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.questions
  drop constraint if exists questions_accepted_answer_fk;
alter table public.questions
  add constraint questions_accepted_answer_fk
  foreign key (accepted_answer_id) references public.answers (id) on delete set null;

create table if not exists public.answer_votes (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  answer_id uuid not null references public.answers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, answer_id)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists pets_owner_idx on public.pets (owner_id);
create index if not exists routines_pet_idx on public.routines (pet_id);
create index if not exists routine_logs_date_idx on public.routine_logs (owner_id, log_date);
create index if not exists vaccinations_pet_idx on public.vaccinations (pet_id, next_due);
create index if not exists appointments_owner_idx on public.appointments (owner_id, starts_at);
create index if not exists checklist_items_list_idx on public.checklist_items (checklist_id, position);
create index if not exists questions_created_idx on public.questions (created_at desc);
create index if not exists answers_question_idx on public.answers (question_id, created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.pets enable row level security;
alter table public.routines enable row level security;
alter table public.routine_logs enable row level security;
alter table public.vaccinations enable row level security;
alter table public.appointments enable row level security;
alter table public.checklists enable row level security;
alter table public.checklist_items enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.answer_votes enable row level security;

-- Profiles: anyone can read display names (community), only self can edit
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select using (true);
drop policy if exists "profiles update self" on public.profiles;
create policy "profiles update self" on public.profiles for update using (auth.uid() = id);
drop policy if exists "profiles insert self" on public.profiles;
create policy "profiles insert self" on public.profiles for insert with check (auth.uid() = id);

-- Owner-scoped tables: full CRUD only on your own rows
do $$
declare t text;
begin
  foreach t in array array['pets', 'routines', 'routine_logs', 'vaccinations', 'appointments', 'checklists', 'checklist_items']
  loop
    execute format('drop policy if exists "owner all" on public.%I', t);
    execute format(
      'create policy "owner all" on public.%I for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id)',
      t
    );
  end loop;
end $$;

-- Community: public read, signed-in write, author edit/delete
drop policy if exists "questions read" on public.questions;
create policy "questions read" on public.questions for select using (true);
drop policy if exists "questions insert" on public.questions;
create policy "questions insert" on public.questions for insert with check (auth.uid() = author_id);
drop policy if exists "questions update" on public.questions;
create policy "questions update" on public.questions for update using (auth.uid() = author_id);
drop policy if exists "questions delete" on public.questions;
create policy "questions delete" on public.questions for delete using (auth.uid() = author_id);

drop policy if exists "answers read" on public.answers;
create policy "answers read" on public.answers for select using (true);
drop policy if exists "answers insert" on public.answers;
create policy "answers insert" on public.answers for insert with check (auth.uid() = author_id);
drop policy if exists "answers update" on public.answers;
create policy "answers update" on public.answers for update using (auth.uid() = author_id);
drop policy if exists "answers delete" on public.answers;
create policy "answers delete" on public.answers for delete using (auth.uid() = author_id);

drop policy if exists "votes read" on public.answer_votes;
create policy "votes read" on public.answer_votes for select using (true);
drop policy if exists "votes insert" on public.answer_votes;
create policy "votes insert" on public.answer_votes for insert with check (auth.uid() = user_id);
drop policy if exists "votes delete" on public.answer_votes;
create policy "votes delete" on public.answer_votes for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Realtime for the community feed
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.questions;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.answers;
  exception when duplicate_object then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Storage: public bucket for pet photos, users write into their own folder
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('pet-photos', 'pet-photos', true)
on conflict (id) do nothing;

drop policy if exists "pet photos read" on storage.objects;
create policy "pet photos read" on storage.objects
  for select using (bucket_id = 'pet-photos');

drop policy if exists "pet photos write own folder" on storage.objects;
create policy "pet photos write own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pet-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "pet photos update own folder" on storage.objects;
create policy "pet photos update own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'pet-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "pet photos delete own folder" on storage.objects;
create policy "pet photos delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'pet-photos' and (storage.foldername(name))[1] = auth.uid()::text);
