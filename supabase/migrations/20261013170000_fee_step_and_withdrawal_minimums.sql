-- Fee kelipatan Rp1.000 & minimal penarikan per metode payment.
update public.app_settings
set fee = round(greatest(fee, 0) / 1000.0) * 1000,
    payment_fees = (
      select coalesce(jsonb_object_agg(key, round(greatest(coalesce((value #>> '{}')::numeric, 0), 0) / 1000.0) * 1000), '{}'::jsonb)
      from jsonb_each(payment_fees)
    );

alter table public.app_settings drop constraint if exists app_settings_fee_step;
alter table public.app_settings
  add constraint app_settings_fee_step check (fee >= 0 and fee % 1000 = 0);

alter table public.withdrawals drop constraint if exists withdrawals_fee_step;
alter table public.withdrawals
  add constraint withdrawals_fee_step check (fee >= 0 and fee % 1000 = 0) not valid;

create or replace function public.enforce_withdrawal_minimum()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  required bigint;
begin
  if new.wallet_bank = 'DANA' then
    select coalesce(min_withdrawal, 0) into required from public.app_settings where id = 1;
  else
    required := 15000;
  end if;
  if new.amount < coalesce(required, 0) then
    raise exception 'Minimal penarikan % adalah Rp%', new.wallet_bank, required;
  end if;
  return new;
end;
$$;

drop trigger if exists withdrawals_enforce_minimum on public.withdrawals;
create trigger withdrawals_enforce_minimum
  before insert on public.withdrawals
  for each row execute function public.enforce_withdrawal_minimum();
