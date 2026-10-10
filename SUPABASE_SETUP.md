# Supabase backend setup

Migration backend sudah diterapkan ke project Supabase `ryuu` (`eiwjpbfkxmtytmtiqpfj`). Tabel yang dibuat:

- `app_settings`
- `profiles`
- `sessions`
- `deposits`
- `withdrawals`

## Environment variables deployment

Tambahkan variable berikut di deployment server (Vercel/host lain):

```text
SUPABASE_URL=https://eiwjpbfkxmtytmtiqpfj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key dari Supabase Project Settings > API>
ADMIN_USERNAME=<username admin>
ADMIN_PASSWORD=<password admin minimal 6 karakter>
```

`SUPABASE_SERVICE_ROLE_KEY` hanya boleh dipasang sebagai server-side secret. Jangan memakai prefix `VITE_` dan jangan memasukkannya ke source code.

## Endpoint utama

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/settings`
- `GET /api/deposits`
- `POST /api/deposits`
- `GET /api/admin/deposits`
- `GET /api/admin/users`
- `POST /api/admin/deposits/:id/approve`
- `POST /api/admin/deposits/:id/reject`
- `PATCH /api/admin/settings`

Semua session memakai cookie `HttpOnly`, dan semua operasi saldo/approval dijalankan di server setelah validasi session admin.
