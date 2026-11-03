alter table public.withdrawals
  add column if not exists fee_deducted_from_amount boolean not null default false;

create or replace function public.enforce_withdrawal_minimum()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  required bigint := 4000;
begin
  if new.wallet_bank = 'DANA' then
    select greatest(coalesce(min_withdrawal, 4000), 4000)
      into required
      from public.app_settings
      where id = 1;
  end if;
  if new.amount < required then
    raise exception 'Minimal penarikan % adalah Rp%', new.wallet_bank, required;
  end if;
  return new;
end;
$$;
