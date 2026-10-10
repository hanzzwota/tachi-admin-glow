alter table public.app_settings add column if not exists auto_stock_enabled boolean not null default false;
alter table public.app_settings add column if not exists gmail_stock jsonb not null default '[]'::jsonb;
alter table public.profiles add column if not exists wallet_bank text not null default 'DANA';
alter table public.profiles add column if not exists wallet_name text not null default '';
alter table public.profiles add column if not exists wallet_number text not null default '';

create or replace function public.claim_gmail_stock()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  stock jsonb;
  item text;
begin
  select gmail_stock into stock from public.app_settings where id = 1 for update;
  if stock is null or jsonb_array_length(stock) = 0 then
    return null;
  end if;
  item := stock ->> 0;
  update public.app_settings set gmail_stock = stock - 0 where id = 1;
  return item;
end;
$$;
