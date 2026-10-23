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
- `PATCH /api/wallet`
- `GET /api/withdrawals`
- `POST /api/withdrawals`
- `GET /api/admin/withdrawals`
- `POST /api/admin/withdrawals/:id/approve`
- `POST /api/admin/withdrawals/:id/reject`
- `POST /api/stock/claim`

Semua session memakai cookie `HttpOnly; SameSite=None; Secure`, dan semua data akun, saldo, setoran, withdrawal, konfigurasi, serta stok Gmail dibaca/ditulis melalui server dan Supabase. Browser storage bukan sumber data aplikasi.
