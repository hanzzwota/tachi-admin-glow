alter table public.app_settings
  add column if not exists information_cards jsonb not null default '[]'::jsonb;

update public.app_settings
set information_cards = jsonb_build_array(
  jsonb_build_object(
    'category', 'Pengumuman',
    'title', 'Info Terbaru',
    'info', announcement
  )
)
where coalesce(btrim(announcement), '') <> ''
  and information_cards = '[]'::jsonb;
