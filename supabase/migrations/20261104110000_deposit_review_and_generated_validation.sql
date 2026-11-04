-- Deposit review: honor the Gmail selections sent by the admin UI.
create or replace function public.approve_deposit_atomic(
  p_deposit_id uuid,
  p_admin_id uuid,
  p_accepted_emails jsonb default null
)
returns table(ok boolean, earned bigint, error_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deposits%rowtype;
  accepted_emails jsonb;
  accepted bigint;
  amount bigint;
begin
  select * into d from public.deposits where id = p_deposit_id for update;
  if not found then return query select false, 0::bigint, 'not_found'; return; end if;
  if d.status <> 'pending' then return query select false, 0::bigint, 'already_processed'; return; end if;

  accepted_emails := coalesce(p_accepted_emails, d.emails);
  if jsonb_typeof(accepted_emails) is distinct from 'array'
     or not (accepted_emails <@ coalesce(d.emails, '[]'::jsonb)) then
    return query select false, 0::bigint, 'invalid_email_selection'; return;
  end if;
  accepted := jsonb_array_length(accepted_emails);
  if accepted < 1 then return query select false, 0::bigint, 'email_selection_required'; return; end if;
  amount := coalesce(d.rate, 0) * accepted;

  update public.deposits
  set status = 'diterima', accepted_count = accepted, accepted_emails = accepted_emails,
      earned = amount, verified_at = now(), approved_at = now(), updated_at = now(),
      processed_by_admin_id = p_admin_id
  where id = p_deposit_id;
  insert into public.user_earnings_history(user_id, transaction_id, amount)
  values (d.user_id, d.id, amount)
  on conflict (transaction_id) do nothing;
  if found then
    update public.profiles set balance = balance + amount where id = d.user_id;
  end if;
  insert into public.transaction_status_logs(transaction_id, previous_status, new_status, admin_id)
  values (d.id, d.status, 'diterima', p_admin_id);
  return query select true, amount, null::text;
end;
$$;

grant execute on function public.approve_deposit_atomic(uuid, uuid, jsonb) to service_role;

create or replace function public.reject_deposit_atomic(
  p_deposit_id uuid,
  p_admin_id uuid,
  p_reason text,
  p_rejected_emails jsonb default null
)
returns table(ok boolean, error_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deposits%rowtype;
  rejected_emails jsonb;
  old_status text;
begin
  if p_reason is null or btrim(p_reason) = '' then return query select false, 'reason_required'; return; end if;
  select * into d from public.deposits where id = p_deposit_id for update;
  if not found then return query select false, 'not_found'; return; end if;
  old_status := d.status;
  if old_status <> 'pending' then return query select false, 'already_processed'; return; end if;
  rejected_emails := coalesce(p_rejected_emails, d.emails);
  if jsonb_typeof(rejected_emails) is distinct from 'array'
     or not (rejected_emails <@ coalesce(d.emails, '[]'::jsonb)) then
    return query select false, 'invalid_email_selection'; return;
  end if;
  if jsonb_array_length(rejected_emails) < 1 then
    return query select false, 'email_selection_required'; return;
  end if;

  update public.deposits
  set status = 'ditolak', reason = btrim(p_reason), rejected_emails = rejected_emails,
      rejected_at = now(), verified_at = now(), updated_at = now(), processed_by_admin_id = p_admin_id
  where id = p_deposit_id;
  insert into public.transaction_status_logs(transaction_id, previous_status, new_status, rejection_reason, admin_id)
  values (p_deposit_id, old_status, 'ditolak', btrim(p_reason), p_admin_id);
  return query select true, null::text;
end;
$$;

grant execute on function public.reject_deposit_atomic(uuid, uuid, text, jsonb) to service_role;
