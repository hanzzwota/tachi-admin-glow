-- Leaderboard dihitung langsung di database dari tabel deposits agar selalu sinkron
-- dengan setoran user (tanpa batas 5000 baris dan tanpa agregasi manual di server).
-- Hanya setoran berstatus 'diterima' dari akun user yang tidak diblokir yang dihitung.
create index if not exists deposits_status_created_idx
  on public.deposits(status, created_at desc);

create or replace function public.leaderboard_stats(
  p_since timestamptz default null,
  p_user_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with per_deposit as (
    select
      d.user_id,
      case
        when jsonb_typeof(d.accepted_emails) = 'array' and jsonb_array_length(d.accepted_emails) > 0
          then jsonb_array_length(d.accepted_emails)
        else greatest(coalesce(d.accepted_count, 0), 0)
      end as gmails,
      greatest(coalesce(d.earned, 0), 0) as earned
    from public.deposits d
    where d.status = 'diterima'
      and (p_since is null or d.created_at >= p_since)
  ),
  per_user as (
    select
      pd.user_id,
      p.username,
      coalesce(nullif(p.display_name, ''), p.username) as display_name,
      coalesce(p.avatar_url, '') as avatar_url,
      sum(pd.gmails)::bigint as approved_gmails,
      count(*) filter (where pd.gmails > 0)::bigint as deposit_count,
      sum(pd.earned)::bigint as earnings
    from per_deposit pd
    join public.profiles p on p.id = pd.user_id
    where p.role = 'user' and not coalesce(p.is_blocked, false)
    group by pd.user_id, p.username, p.display_name, p.avatar_url
    having sum(pd.gmails) > 0
  ),
  ranked as (
    select
      row_number() over (order by approved_gmails desc, deposit_count desc, username asc)::integer as rank,
      *
    from per_user
  )
  select jsonb_build_object(
    'leaderboard', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'rank', r.rank,
          'user_id', r.user_id,
          'username', r.username,
          'display_name', r.display_name,
          'avatar_url', r.avatar_url,
          'approved_gmails', r.approved_gmails,
          'deposit_count', r.deposit_count,
          'earnings', r.earnings
        ) order by r.rank
      )
      from ranked r
      where r.rank <= greatest(1, least(coalesce(p_limit, 50), 100))
    ), '[]'::jsonb),
    'me', (
      select jsonb_build_object(
        'rank', r.rank,
        'user_id', r.user_id,
        'username', r.username,
        'display_name', r.display_name,
        'avatar_url', r.avatar_url,
        'approved_gmails', r.approved_gmails,
        'deposit_count', r.deposit_count,
        'earnings', r.earnings
      )
      from ranked r
      where p_user_id is not null and r.user_id = p_user_id
    ),
    'totals', jsonb_build_object(
      'approved_gmails', coalesce((select sum(approved_gmails) from ranked), 0),
      'depositors', (select count(*) from ranked),
      'deposits', coalesce((select sum(deposit_count) from ranked), 0)
    )
  );
$$;

revoke execute on function public.leaderboard_stats(timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.leaderboard_stats(timestamptz, uuid, integer) to service_role;
