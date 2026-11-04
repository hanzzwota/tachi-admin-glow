alter table public.app_settings
  add column if not exists pw_text text not null default 'PW',
  add column if not exists pw_enabled boolean not null default true,
  add column if not exists captcha_enabled boolean not null default false,
  add column if not exists captcha_text text not null default 'CAPTCHA';
