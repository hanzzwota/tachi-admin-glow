create table if not exists public.generated_gmail_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  gmail text not null,
  normalized_gmail text generated always as (lower(btrim(gmail))) stored,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint generated_gmail_claims_normalized_unique unique (normalized_gmail)
);

create index if not exists generated_gmail_claims_user_created_idx
  on public.generated_gmail_claims(user_id, created_at desc);

alter table public.generated_gmail_claims enable row level security;
grant select, update on public.generated_gmail_claims to service_role;

create or replace function public.claim_gmail_stock_batch(p_user_id uuid, p_count integer)
returns table (gmail text)
language plpgsql
security definer
set search_path = public
as $$
declare
  stock jsonb;
  email_value text;
  inserted_id uuid;
  claimed_count integer := 0;
  attempts integer := 0;
begin
  if p_user_id is null then
    raise exception 'User wajib diisi';
  end if;
  if p_count is null or p_count < 1 or p_count > 5 then
    raise exception 'Jumlah klaim harus 1-5';
  end if;

  select coalesce(gmail_stock, '[]'::jsonb)
    into stock
    from public.app_settings
    where id = 1
    for update;
  if not found then return; end if;
  if jsonb_typeof(stock) is distinct from 'array' then stock := '[]'::jsonb; end if;

  while jsonb_array_length(stock) > 0 and claimed_count < p_count and attempts < 1000 loop
    email_value := btrim(stock ->> 0);
    stock := stock - 0;
    attempts := attempts + 1;

    if email_value <> '' then
      perform pg_advisory_xact_lock(hashtextextended(lower(email_value), 0));
      if not exists (
        select 1
          from public.generated_gmail_claims c
          where c.normalized_gmail = lower(email_value)
      ) and not exists (
        select 1
          from public.deposits d
          cross join lateral jsonb_array_elements_text(d.emails) submitted(value)
          where lower(btrim(submitted.value)) = lower(email_value)
      ) then
        inserted_id := null;
        insert into public.generated_gmail_claims(user_id, gmail)
          values (p_user_id, email_value)
          on conflict (normalized_gmail) do nothing
          returning id into inserted_id;
        if inserted_id is not null then
          gmail := email_value;
          claimed_count := claimed_count + 1;
          return next;
        end if;
      end if;
    end if;
  end loop;

  update public.app_settings set gmail_stock = stock where id = 1;
  return;
end;
$$;

revoke execute on function public.claim_gmail_stock_batch(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_gmail_stock_batch(uuid, integer) to service_role;

create or replace function public.enforce_generated_gmail_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  email_value text;
begin
  for email_value in
    select distinct lower(btrim(item.value))
      from jsonb_array_elements_text(coalesce(new.emails, '[]'::jsonb)) as item(value)
      where btrim(item.value) <> ''
  loop
    perform pg_advisory_xact_lock(hashtextextended(email_value, 0));
    if exists (
      select 1
        from public.generated_gmail_claims c
        where c.normalized_gmail = email_value
          and c.user_id <> new.user_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'Gmail ini sudah diklaim oleh akun lain';
    end if;
  end loop;
  return new;
end;
$$;

revoke execute on function public.enforce_generated_gmail_owner() from public, anon, authenticated;

drop trigger if exists deposits_enforce_generated_gmail_owner on public.deposits;
create trigger deposits_enforce_generated_gmail_owner
  before insert or update of emails, user_id on public.deposits
  for each row execute function public.enforce_generated_gmail_owner();
