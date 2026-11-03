alter table public.app_settings
  add column if not exists store_closed_reason text not null default '';
