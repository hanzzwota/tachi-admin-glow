alter table public.app_settings
  add column if not exists pw_rate bigint not null default 4500,
  add column if not exists captcha_rate bigint not null default 4500;

update public.app_settings
set
  pw_rate = greatest(coalesce(rate, 4500), 0),
  captcha_rate = greatest(coalesce(rate, 4500), 0)
where id = 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_settings_pw_rate_nonnegative'
      and conrelid = 'public.app_settings'::regclass
  ) then
    alter table public.app_settings
      add constraint app_settings_pw_rate_nonnegative check (pw_rate >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_settings_captcha_rate_nonnegative'
      and conrelid = 'public.app_settings'::regclass
  ) then
    alter table public.app_settings
      add constraint app_settings_captcha_rate_nonnegative check (captcha_rate >= 0);
  end if;
end
$$;
