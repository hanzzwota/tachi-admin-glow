-- Apply to the existing database before deploying the optimized endpoint.
-- Never release the registry or generated-claim row when an address is discarded.
create or replace function public.deposit_gmail_retry_allowed(p_deposit_id uuid, p_user_id uuid, p_email text)
returns boolean language sql stable set search_path = public as $$
  select exists (select 1 from public.deposits d
    where d.id = p_deposit_id and d.user_id = p_user_id
      and d.status = 'ditolak' and lower(btrim(d.reason)) = 'unregist'
      and not exists (select 1 from jsonb_array_elements_text(coalesce(d.accepted_emails, '[]'::jsonb)) e(value)
                      where lower(btrim(e.value)) = p_email)
      and (coalesce(d.rejected_emails, '[]'::jsonb) = '[]'::jsonb or exists (
        select 1 from jsonb_array_elements_text(d.rejected_emails) e(value) where lower(btrim(e.value)) = p_email)));
$$;
revoke execute on function public.deposit_gmail_retry_allowed(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.deposit_gmail_retry_allowed(uuid, uuid, text) to service_role;

create or replace function public.track_unique_submitted_gmails()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_email text; v_inserted integer;
begin
  if exists (select lower(btrim(e.value)) from jsonb_array_elements_text(new.emails) e(value)
             group by lower(btrim(e.value)) having count(*) > 1) then
    raise exception using errcode = '23505', message = 'Gmail yang sama tidak boleh dikirim lebih dari satu kali';
  end if;
  if tg_op = 'UPDATE' then
    if new.emails is distinct from old.emails then raise exception 'Daftar Gmail setoran tidak dapat diubah'; end if;
    return new;
  end if;
  for v_email in select lower(btrim(e.value)) from jsonb_array_elements_text(new.emails) e(value) order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(v_email, 0));
    insert into public.submitted_gmail_registry as r(normalized_gmail, gmail, deposit_id, created_at)
      values (v_email, v_email, new.id, new.created_at)
      on conflict (normalized_gmail) do update
        set deposit_id = excluded.deposit_id, gmail = excluded.gmail, created_at = excluded.created_at
        where public.deposit_gmail_retry_allowed(r.deposit_id, new.user_id, v_email);
    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      raise exception using errcode = '23505', message = 'Gmail ini sudah pernah dikirim dan tidak dapat dikirim ulang';
    end if;
  end loop;
  return new;
end;
$$;
revoke execute on function public.track_unique_submitted_gmails() from public, anon, authenticated;

create index if not exists deposits_created_at_idx on public.deposits(created_at);
create or replace function public.deposit_daily_usage()
returns bigint language sql stable set search_path = public as $$
  select coalesce(sum(jsonb_array_length(d.emails)), 0)::bigint from public.deposits d
  where d.created_at >= (date_trunc('day', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta');
$$;
revoke execute on function public.deposit_daily_usage() from public, anon, authenticated;
grant execute on function public.deposit_daily_usage() to service_role;

create or replace function public.submit_deposit_atomic(
  p_token_hash text, p_emails text[], p_jalur text, p_campaign_password text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid; v_blocked boolean; v_settings public.app_settings%rowtype;
  v_emails text[]; v_email text; v_count integer; v_used bigint; v_rate bigint;
  v_deposit public.deposits%rowtype;
begin
  select p.id, p.is_blocked into v_user_id, v_blocked
    from public.sessions s join public.profiles p on p.id = s.profile_id
    where s.token_hash = p_token_hash and s.expires_at > now();
  if v_user_id is null then return jsonb_build_object('status', 401, 'error', 'Anda harus login terlebih dahulu'); end if;
  if v_blocked then return jsonb_build_object('status', 403, 'error', 'Akun Anda diblokir admin'); end if;
  if p_jalur is null or p_jalur not in ('PW', 'CAPTCHA') then
    return jsonb_build_object('status', 400, 'error', 'Jalur setoran tidak valid'); end if;
  select array_agg(lower(btrim(e.value))) into v_emails from unnest(p_emails) e(value);
  v_count := coalesce(cardinality(v_emails), 0);
  if v_count < 1 or v_count > 50 or exists (
    select 1 from unnest(v_emails) e(value) where e.value is null or e.value !~ '^[a-z0-9._%+-]{1,64}@gmail\.com$'
  ) then return jsonb_build_object('status', 400, 'error', 'Daftar Gmail tidak valid atau melebihi 50 akun'); end if;
  if (select count(distinct e.value) from unnest(v_emails) e(value)) <> v_count then
    return jsonb_build_object('status', 409, 'error', 'Gmail yang sama tidak boleh dikirim lebih dari satu kali'); end if;
  -- Same lock order as stock claiming: settings first, normalized addresses next.
  select * into v_settings from public.app_settings where id = 1 for update;
  if not found then return jsonb_build_object('status', 503, 'error', 'Konfigurasi setoran belum tersedia'); end if;
  if not v_settings.store_open then return jsonb_build_object('status', 423, 'error',
    concat_ws(' ', 'Setoran sedang ditutup oleh admin', nullif(v_settings.store_closed_reason, ''))); end if;
  if (p_jalur = 'PW' and not v_settings.pw_enabled) or (p_jalur = 'CAPTCHA' and not v_settings.captcha_enabled) then
    return jsonb_build_object('status', 423, 'error', 'Jalur ' || p_jalur || ' sedang dinonaktifkan admin'); end if;
  if p_jalur = 'PW' and p_campaign_password is distinct from v_settings.campaign_password then
    return jsonb_build_object('status', 403, 'error', 'Password wajib salah'); end if;
  v_rate := case when p_jalur = 'PW' then v_settings.pw_rate else v_settings.captcha_rate end;
  if v_rate is null or v_rate < 0 or v_rate > 9007199254740991 then
    return jsonb_build_object('status', 503, 'error', 'Konfigurasi harga jalur belum valid'); end if;
  if v_count > v_settings.batch_limit then
    return jsonb_build_object('status', 400, 'error', 'Maksimal ' || v_settings.batch_limit || ' Gmail per transaksi'); end if;
  for v_email in select e.value from unnest(v_emails) e(value) order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(v_email, 0));
    if exists (select 1 from public.generated_gmail_claims c where c.normalized_gmail = v_email
               and (c.user_id <> v_user_id or c.archived_at is not null)) then
      return jsonb_build_object('status', 409, 'error', 'Gmail sudah diklaim akun lain atau sudah dibuang: ' || v_email); end if;
    if v_settings.auto_stock_enabled and not exists (
      select 1 from public.generated_gmail_claims c where c.normalized_gmail = v_email
        and c.user_id = v_user_id and c.archived_at is null
    ) then return jsonb_build_object('status', 422, 'warning', true, 'rejected', true,
        'error', 'Setoran tidak dikirim dan tidak masuk Riwayat. Gmail wajib sesuai daftar Generated Gmail pada UI. Gmail tidak sesuai: ' || v_email); end if;
    if exists (select 1 from public.submitted_gmail_registry r where r.normalized_gmail = v_email
               and not public.deposit_gmail_retry_allowed(r.deposit_id, v_user_id, v_email)) then
      return jsonb_build_object('status', 409, 'error', 'Gmail sudah pernah dikirim dan tidak dapat dikirim ulang: ' || v_email); end if;
  end loop;
  v_used := public.deposit_daily_usage();
  if v_settings.daily_limit > 0 and v_used + v_count > v_settings.daily_limit then
    return jsonb_build_object('status', 429, 'error', 'Batas setor hari ini tersisa ' || greatest(0, v_settings.daily_limit - v_used) || ' Gmail'); end if;
  insert into public.deposits(user_id, emails, status, jalur, rate, transaction_number, submitted_at, updated_at)
    values (v_user_id, to_jsonb(v_emails), 'pending', p_jalur, v_rate,
      'TRX-' || to_char(now() at time zone 'Asia/Jakarta', 'YYYYMMDD') || '-' || upper(replace(gen_random_uuid()::text, '-', '')),
      now(), now()) returning * into v_deposit;
  return jsonb_build_object('status', 201, 'deposit', to_jsonb(v_deposit));
end;
$$;
revoke execute on function public.submit_deposit_atomic(text, text[], text, text) from public, anon, authenticated;
grant execute on function public.submit_deposit_atomic(text, text[], text, text) to service_role;