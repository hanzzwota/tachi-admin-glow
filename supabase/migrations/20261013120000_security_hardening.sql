-- Security hardening: preserve RLS on every application table and fix atomic stock removal.
alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.deposits enable row level security;
alter table public.withdrawals enable row level security;

create or replace function public.claim_gmail_stock()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  item text;
begin
  update public.app_settings
  set gmail_stock = gmail_stock - 0
  where id = 1
    and jsonb_typeof(gmail_stock) = 'array'
    and jsonb_array_length(gmail_stock) > 0
  returning gmail_stock ->> 0 into item;

  if item is null then return null; end if;

  update public.app_settings
  set gmail_stock = (select jsonb_agg(value) from jsonb_array_elements(gmail_stock) with ordinality as items(value, ordinal) where ordinal > 1)
  where id = 1;
  return item;
end;
$$;

revoke execute on function public.claim_gmail_stock() from public, anon, authenticated;
