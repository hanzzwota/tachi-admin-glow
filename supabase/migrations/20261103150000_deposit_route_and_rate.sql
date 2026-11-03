alter table public.deposits
  add column if not exists jalur text not null default 'PW',
  add column if not exists rate bigint not null default 4500;

update public.deposits
set jalur = 'PW'
where jalur is null or btrim(jalur) = '';

update public.deposits d
set rate = coalesce(nullif(d.rate, 0), s.rate, 4500)
from public.app_settings s
where s.id = 1;

create index if not exists deposits_jalur_idx on public.deposits(jalur);
