create table if not exists public.submitted_gmail_registry (
  normalized_gmail text primary key,
  gmail text not null,
  deposit_id uuid not null references public.deposits(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists submitted_gmail_registry_deposit_idx
  on public.submitted_gmail_registry(deposit_id);

alter table public.submitted_gmail_registry enable row level security;
revoke all on public.submitted_gmail_registry from public, anon, authenticated;
grant select, insert, delete on public.submitted_gmail_registry to service_role;

insert into public.submitted_gmail_registry(normalized_gmail, gmail, deposit_id, created_at)
select normalized_gmail, gmail, deposit_id, created_at
from (
  select distinct on (lower(btrim(email.value)))
    lower(btrim(email.value)) as normalized_gmail,
    btrim(email.value) as gmail,
    deposit.id as deposit_id,
    deposit.created_at
  from public.deposits deposit
  cross join lateral jsonb_array_elements_text(coalesce(deposit.emails, '[]'::jsonb)) as email(value)
  where btrim(email.value) <> ''
  order by lower(btrim(email.value)), deposit.created_at asc, deposit.id
) existing
on conflict (normalized_gmail) do nothing;

create or replace function public.find_duplicate_deposit_gmails(p_emails text[])
returns table (email text)
language sql
security definer
set search_path = public
as $$
  select requested.normalized_gmail as email
  from (
    select distinct lower(btrim(candidate.value)) as normalized_gmail
    from unnest(coalesce(p_emails, array[]::text[])) as candidate(value)
    where btrim(candidate.value) <> ''
  ) requested
  join public.submitted_gmail_registry existing
    on existing.normalized_gmail = requested.normalized_gmail
  order by requested.normalized_gmail;
$$;

revoke execute on function public.find_duplicate_deposit_gmails(text[]) from public, anon, authenticated;
grant execute on function public.find_duplicate_deposit_gmails(text[]) to service_role;

create or replace function public.track_unique_submitted_gmails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  original_email text;
  normalized_email text;
  inserted_count integer;
begin
  if exists (
    select lower(btrim(email.value))
    from jsonb_array_elements_text(coalesce(new.emails, '[]'::jsonb)) as email(value)
    where btrim(email.value) <> ''
    group by lower(btrim(email.value))
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Gmail yang sama tidak boleh dikirim lebih dari satu kali';
  end if;

  if tg_op = 'UPDATE' then
    delete from public.submitted_gmail_registry where deposit_id = new.id;
  end if;

  for original_email, normalized_email in
    select min(btrim(email.value)), lower(btrim(email.value))
    from jsonb_array_elements_text(coalesce(new.emails, '[]'::jsonb)) as email(value)
    where btrim(email.value) <> ''
    group by lower(btrim(email.value))
  loop
    insert into public.submitted_gmail_registry(normalized_gmail, gmail, deposit_id, created_at)
      values (normalized_email, original_email, new.id, coalesce(new.created_at, now()))
      on conflict (normalized_gmail) do nothing;
    get diagnostics inserted_count = row_count;
    if inserted_count = 0 then
      raise exception using
        errcode = '23505',
        message = 'Gmail ini sudah pernah dikirim dan tidak dapat dikirim ulang';
    end if;
  end loop;

  return new;
end;
$$;

revoke execute on function public.track_unique_submitted_gmails() from public, anon, authenticated;

drop trigger if exists deposits_track_unique_submitted_gmails on public.deposits;
create trigger deposits_track_unique_submitted_gmails
  after insert or update of emails on public.deposits
  for each row execute function public.track_unique_submitted_gmails();
