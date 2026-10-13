alter table public.app_settings
  add column if not exists support_channels jsonb not null default '{"whatsapp":[],"telegram":[]}'::jsonb;
