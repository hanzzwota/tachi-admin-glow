create extension if not exists pgcrypto;

create table if not exists public.app_settings (
  id integer primary key default 1 check (id = 1),
  rate bigint not null default 4500,
  min_withdrawal bigint not null default 4000,
  fee bigint not null default 0,
  campaign_password text not null default 'sgsg1122',
  store_open boolean not null default true,
  withdraw_open boolean not null default true,
  daily_limit integer not null default 500,
  batch_limit integer not null default 1,
  announcement text not null default ''
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text not null default '',
  password_hash text not null,
  password_salt text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  balance bigint not null default 0 check (balance >= 0),
  withdrawn bigint not null default 0 check (withdrawn >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  token_hash text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_profile_id_idx on public.sessions(profile_id);
create index if not exists sessions_expires_at_idx on public.sessions(expires_at);

create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  emails jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'diterima', 'ditolak')),
  accepted_count integer not null default 0,
  earned bigint not null default 0,
  reason text,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);
create index if not exists deposits_user_id_idx on public.deposits(user_id);
create index if not exists deposits_status_idx on public.deposits(status);

create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount bigint not null check (amount > 0),
  fee bigint not null default 0,
  wallet_name text not null,
  wallet_number text not null,
  status text not null default 'pending' check (status in ('pending', 'selesai', 'ditolak')),
  reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists withdrawals_user_id_idx on public.withdrawals(user_id);

alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.deposits enable row level security;
alter table public.withdrawals enable row level security;

-- Semua akses aplikasi melewati endpoint server dengan service role key.
-- Tidak ada policy publik yang boleh membaca atau mengubah saldo/session.
