-- TORN_D v3 database. Run the entire file in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user','admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.access_keys (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  key_hash text not null unique,
  expires_at timestamptz,
  is_permanent boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint access_key_expiry check (is_permanent = true or expires_at is not null)
);

create table if not exists public.api_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  endpoint_url text,
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.api_health (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.api_sources(id) on delete cascade,
  status text not null default 'unknown' check (status in ('unknown','healthy','degraded','down')),
  checked_at timestamptz not null default now(),
  detail text
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.access_keys enable row level security;
alter table public.api_sources enable row level security;
alter table public.api_health enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.is_active_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active = true
  );
$$;

drop policy if exists "profile self or admin read" on public.profiles;
create policy "profile self or admin read" on public.profiles
for select to authenticated using (id = auth.uid() or public.is_active_admin());

drop policy if exists "admin manage profiles" on public.profiles;
create policy "admin manage profiles" on public.profiles
for all to authenticated using (public.is_active_admin()) with check (public.is_active_admin());

drop policy if exists "admin manage access keys" on public.access_keys;
create policy "admin manage access keys" on public.access_keys
for all to authenticated using (public.is_active_admin()) with check (public.is_active_admin());

drop policy if exists "admin manage API sources" on public.api_sources;
create policy "admin manage API sources" on public.api_sources
for all to authenticated using (public.is_active_admin()) with check (public.is_active_admin());

drop policy if exists "admin manage API health" on public.api_health;
create policy "admin manage API health" on public.api_health
for all to authenticated using (public.is_active_admin()) with check (public.is_active_admin());

drop policy if exists "admin read audit logs" on public.audit_logs;
create policy "admin read audit logs" on public.audit_logs
for select to authenticated using (public.is_active_admin());

drop policy if exists "admin write audit logs" on public.audit_logs;
create policy "admin write audit logs" on public.audit_logs
for insert to authenticated with check (public.is_active_admin() and actor_id = auth.uid());

-- FIRST ADMIN SETUP:
-- 1) Create the user in Supabase > Authentication > Users > Add user.
-- 2) Copy that user's UUID.
-- 3) Replace UUID below and run this statement separately:
-- insert into public.profiles(id, role, is_active)
-- values ('PASTE_REAL_AUTH_USER_UUID_HERE', 'admin', true)
-- on conflict (id) do update set role='admin', is_active=true;
