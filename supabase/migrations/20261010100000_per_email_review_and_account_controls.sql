alter table public.deposits add column if not exists accepted_emails jsonb not null default '[]'::jsonb;
alter table public.deposits add column if not exists rejected_emails jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists is_blocked boolean not null default false;
