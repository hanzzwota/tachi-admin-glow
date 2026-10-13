alter table public.app_settings
  add column if not exists rules_text text not null default '1. Gmail harus fresh.\n2. Wajib menggunakan password yang dicantumkan di bawah.\n3. Keputusan admin tachi69gmail mutlak.';
