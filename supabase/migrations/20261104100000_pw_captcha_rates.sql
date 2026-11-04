do $$
declare
  had_pw_rate boolean;
  had_captcha_rate boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_settings'
      and column_name = 'pw_rate'
  ) into had_pw_rate;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_settings'
      and column_name = 'captcha_rate'
  ) into had_captcha_rate;

  alter table public.app_settings
    add column if not exists pw_rate bigint not null default 4500,
    add column if not exists captcha_rate bigint not null default 4500;

  update public.app_settings
  set
    pw_rate = case when not had_pw_rate then greatest(coalesce(rate, 4500), 0) else pw_rate end,
    captcha_rate = case when not had_captcha_rate then greatest(coalesce(rate, 4500), 0) else captcha_rate end
  where id = 1 and (not had_pw_rate or not had_captcha_rate);
end
$$;

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
