-- Hapus Gmail dari daftar "Generated Gmail" user:
--   * sedang diproses (setoran pending)        -> ditolak, tidak boleh dihapus
--   * belum disetor                            -> kembali ke stok
--   * ditolak karena Unregist                  -> kembali ke stok
--   * berhasil / ditolak alasan lain           -> diarsipkan (tidak kembali ke stok)

create or replace function public.delete_generated_gmail(p_user_id uuid, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock jsonb;
  v_claim public.generated_gmail_claims%rowtype;
  v_dep public.deposits%rowtype;
  v_norm text;
  v_unregist boolean := false;
begin
  -- Urutan lock sama dengan claim_gmail_stock_batch / submit_deposit_atomic: settings dulu.
  select coalesce(gmail_stock, '[]'::jsonb) into v_stock
    from public.app_settings where id = 1 for update;
  if not found then
    return jsonb_build_object('outcome', 'unavailable');
  end if;
  if jsonb_typeof(v_stock) is distinct from 'array' then v_stock := '[]'::jsonb; end if;

  select * into v_claim from public.generated_gmail_claims
    where id = p_id and user_id = p_user_id and archived_at is null
    for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  v_norm := v_claim.normalized_gmail;
  perform pg_advisory_xact_lock(hashtextextended(v_norm, 0));

  select d.* into v_dep
    from public.deposits d
    where exists (
      select 1 from jsonb_array_elements_text(coalesce(d.emails, '[]'::jsonb)) e(value)
      where lower(btrim(e.value)) = v_norm
    )
    order by d.created_at desc
    limit 1;

  if found then
    if v_dep.status = 'pending' then
      return jsonb_build_object('outcome', 'processing');
    end if;
    v_unregist := public.deposit_gmail_retry_allowed(v_dep.id, v_dep.user_id, v_norm);
    if not v_unregist then
      -- berhasil atau ditolak (bukan unregist): dibuang, tidak kembali ke stok
      update public.generated_gmail_claims set archived_at = now() where id = v_claim.id;
      return jsonb_build_object('outcome', 'archived');
    end if;
  end if;

  -- belum disetor / unregist: kembalikan ke stok
  if v_unregist then
    delete from public.submitted_gmail_registry where normalized_gmail = v_norm;
  end if;
  delete from public.generated_gmail_claims where id = v_claim.id;

  if not exists (
    select 1 from jsonb_array_elements_text(v_stock) s(value)
    where lower(btrim(s.value)) = v_norm
  ) then
    v_stock := v_stock || to_jsonb(v_claim.gmail);
    update public.app_settings set gmail_stock = v_stock where id = 1;
  end if;

  return jsonb_build_object('outcome', 'returned');
end;
$$;

revoke execute on function public.delete_generated_gmail(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_generated_gmail(uuid, uuid) to service_role;

-- Gmail unregist yang dikembalikan ke stok harus bisa diklaim lagi:
-- setoran lamanya (ditolak unregist) tidak boleh lagi memblokir klaim.
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
            and not public.deposit_gmail_retry_allowed(d.id, d.user_id, lower(email_value))
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
