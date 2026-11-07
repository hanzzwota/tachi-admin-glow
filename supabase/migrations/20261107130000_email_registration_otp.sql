alter table public.profiles add column if not exists email text;
create unique index if not exists profiles_email_unique_idx
  on public.profiles (lower(email)) where email is not null and email <> '';

create table if not exists public.registration_otps (
  registration_id uuid primary key,
  username text not null,
  email text not null,
  display_name text not null,
  password_hash text not null,
  password_salt text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 5),
  created_at timestamptz not null default now()
);
create index if not exists registration_otps_expires_at_idx
  on public.registration_otps (expires_at);
alter table public.registration_otps enable row level security;
