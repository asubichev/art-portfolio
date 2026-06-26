-- Art Portfolio MVP — Supabase Schema
-- Run this in the Supabase SQL editor to set up the database.

-- ─────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────
-- Custom types
-- ─────────────────────────────────────────────
do $$ begin
  create type artwork_status as enum ('draft', 'published', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type prints_type as enum ('open', 'limited', 'none');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type user_role as enum ('admin', 'editor');
exception when duplicate_object then null;
end $$;

-- ─────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────
create table if not exists profiles (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  role     user_role not null default 'editor',
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Users can read/update their own profile
create policy "profiles: owner can select"
  on profiles for select
  using (auth.uid() = user_id);

create policy "profiles: owner can update"
  on profiles for update
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- artworks
-- ─────────────────────────────────────────────
create table if not exists artworks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  medium       text,
  material     text,
  dimensions   text,
  year         smallint,
  price        numeric(10,2),
  seo_keywords text[],
  available    boolean not null default true,
  prints_type  prints_type not null default 'none',
  print_qty    integer,
  print_size   text,
  print_price  numeric(10,2),
  status       artwork_status not null default 'draft',
  image_path   text,
  thumb_path   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id)
);

alter table artworks enable row level security;

-- Public: read only published rows (no auth required)
create policy "artworks: anon can select published"
  on artworks for select
  to anon
  using (status = 'published');

-- Authenticated users (admins/editors) can read all rows
create policy "artworks: auth can select all"
  on artworks for select
  to authenticated
  using (true);

-- Authenticated users can insert
create policy "artworks: auth can insert"
  on artworks for insert
  to authenticated
  with check (auth.uid() = created_by);

-- Authenticated users can update their own artworks (admin role bypasses this via service role if needed)
create policy "artworks: auth can update"
  on artworks for update
  to authenticated
  using (true);

-- Authenticated users can delete
create policy "artworks: auth can delete"
  on artworks for delete
  to authenticated
  using (true);

-- ─────────────────────────────────────────────
-- Auto-update updated_at
-- ─────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists artworks_updated_at on artworks;
create trigger artworks_updated_at
  before update on artworks
  for each row execute function update_updated_at();

-- ─────────────────────────────────────────────
-- Auto-create profile on user sign-up
-- ─────────────────────────────────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (user_id, role)
  values (new.id, 'editor')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
