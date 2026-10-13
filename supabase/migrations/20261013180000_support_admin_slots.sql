-- Store each support admin as one synchronized slot so the dashboard can
-- enable/disable an admin without mixing WhatsApp and Telegram contacts.
alter table public.app_settings
  alter column support_channels set default '{"admins":[{"name":"Admin 1","whatsapp":"","telegram":"","enabled":true},{"name":"Admin 2","whatsapp":"","telegram":"","enabled":true}]}'::jsonb;

update public.app_settings
set support_channels = jsonb_build_object(
  'admins', jsonb_build_array(
    jsonb_build_object(
      'name', 'Admin 1',
      'whatsapp', coalesce(support_channels->'whatsapp'->>0, ''),
      'telegram', coalesce(support_channels->'telegram'->>0, ''),
      'enabled', true
    ),
    jsonb_build_object(
      'name', 'Admin 2',
      'whatsapp', coalesce(support_channels->'whatsapp'->>1, ''),
      'telegram', coalesce(support_channels->'telegram'->>1, ''),
      'enabled', true
    )
  )
)
where support_channels ? 'whatsapp' and not (support_channels ? 'admins');
