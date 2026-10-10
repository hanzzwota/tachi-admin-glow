alter table public.app_settings add column if not exists auto_stock_enabled boolean not null default false;
alter table public.app_settings add column if not exists gmail_stock jsonb not null default '[]'::jsonb;
