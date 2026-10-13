alter table public.app_settings
  add column if not exists payment_fees jsonb not null default '{"DANA":0,"OVO":0,"GoPay":0,"ShopeePay":0,"BCA":0,"BRI":0,"Mandiri":0}'::jsonb;
