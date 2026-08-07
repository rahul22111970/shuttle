-- S0-06: identity. One row per auth user; the account type decides which
-- surface opens. RLS in the same migration, per CLAUDE.md: a table without
-- RLS does not ship.
begin;

create type public.account_type as enum ('player', 'organiser');

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  phone        text unique check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  account_type public.account_type not null,
  upi_vpa      text,
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy profiles_owner_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_owner_insert on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_owner_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

commit;
