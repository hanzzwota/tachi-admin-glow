alter table public.app_settings
  add column if not exists pw_rate bigint not null default 4500,
  add column if not exists captcha_rate bigint not null default 4500,
  add column if not exists information_cards jsonb not null default '[]'::jsonb;
alter table public.app_settings drop constraint if exists app_settings_pw_rate_nonnegative;
alter table public.app_settings add constraint app_settings_pw_rate_nonnegative check (pw_rate >= 0);
alter table public.app_settings drop constraint if exists app_settings_captcha_rate_nonnegative;
alter table public.app_settings add constraint app_settings_captcha_rate_nonnegative check (captcha_rate >= 0);

drop function if exists public.approve_deposit_atomic(uuid, uuid);
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
  v_accepted_emails jsonb;
  v_accepted bigint;
  v_amount bigint;
begin
  select * into d from public.deposits where id = p_deposit_id for update;
  if not found then return query select false, 0::bigint, 'not_found'; return; end if;
  if d.status <> 'pending' then return query select false, 0::bigint, 'already_processed'; return; end if;

  v_accepted_emails := coalesce(p_accepted_emails, d.emails);
  if jsonb_typeof(v_accepted_emails) is distinct from 'array'
     or not (v_accepted_emails <@ coalesce(d.emails, '[]'::jsonb)) then
    return query select false, 0::bigint, 'invalid_email_selection'; return;
  end if;
  v_accepted := jsonb_array_length(v_accepted_emails);
  if v_accepted < 1 then return query select false, 0::bigint, 'email_selection_required'; return; end if;
  v_amount := coalesce(d.rate, 0) * v_accepted;

  update public.deposits as t
  set status = 'diterima', accepted_count = v_accepted, accepted_emails = v_accepted_emails,
      earned = v_amount, verified_at = now(), approved_at = now(), updated_at = now(),
      processed_by_admin_id = p_admin_id
  where t.id = p_deposit_id;
  insert into public.user_earnings_history(user_id, transaction_id, amount)
  values (d.user_id, d.id, v_amount)
  on conflict (transaction_id) do nothing;
  if found then
    update public.profiles set balance = balance + v_amount where id = d.user_id;
  end if;
  insert into public.transaction_status_logs(transaction_id, previous_status, new_status, admin_id)
  values (d.id, d.status, 'diterima', p_admin_id);
  return query select true, v_amount, null::text;
end;
$$;
revoke execute on function public.approve_deposit_atomic(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.approve_deposit_atomic(uuid, uuid, jsonb) to service_role;

drop function if exists public.reject_deposit_atomic(uuid, uuid, text);
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
  v_rejected_emails jsonb;
  old_status text;
begin
  if p_reason is null or btrim(p_reason) = '' then
    return query select false, 'reason_required'; return;
  end if;
  select * into d from public.deposits where id = p_deposit_id for update;
  if not found then return query select false, 'not_found'; return; end if;
  old_status := d.status;
  if old_status <> 'pending' then return query select false, 'already_processed'; return; end if;
  v_rejected_emails := coalesce(p_rejected_emails, d.emails);
  if jsonb_typeof(v_rejected_emails) is distinct from 'array'
     or not (v_rejected_emails <@ coalesce(d.emails, '[]'::jsonb)) then
    return query select false, 'invalid_email_selection'; return;
  end if;
  if jsonb_array_length(v_rejected_emails) < 1 then
    return query select false, 'email_selection_required'; return;
  end if;
  update public.deposits as t
  set status = 'ditolak', reason = btrim(p_reason), rejected_emails = v_rejected_emails,
      rejected_at = now(), verified_at = now(), updated_at = now(), processed_by_admin_id = p_admin_id
  where t.id = p_deposit_id;
  insert into public.transaction_status_logs(transaction_id, previous_status, new_status, rejection_reason, admin_id)
  values (p_deposit_id, old_status, 'ditolak', btrim(p_reason), p_admin_id);
  return query select true, null::text;
end;
$$;
revoke execute on function public.reject_deposit_atomic(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.reject_deposit_atomic(uuid, uuid, text, jsonb) to service_role;

-- Server API uses the service role for every table; browsers never touch tables directly.
grant all on public.app_settings, public.profiles, public.sessions, public.deposits, public.withdrawals,
  public.submitted_gmail_registry, public.generated_gmail_claims, public.transaction_status_logs,
  public.user_earnings_history to service_role;
grant usage, select on all sequences in schema public to service_role;
