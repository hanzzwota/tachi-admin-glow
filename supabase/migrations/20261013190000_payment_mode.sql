alter table public.app_settings
  add column if not exists payment_mode text not null default 'all';

alter table public.app_settings
  drop constraint if exists app_settings_payment_mode_check;

alter table public.app_settings
  add constraint app_settings_payment_mode_check
  check (payment_mode in ('all', 'dana_only'));
