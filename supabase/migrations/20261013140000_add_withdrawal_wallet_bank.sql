alter table public.withdrawals
  add column if not exists wallet_bank text not null default 'DANA';
