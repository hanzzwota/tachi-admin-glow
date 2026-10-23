# Supabase backend setup

Backend aplikasi menggunakan tabel kustom melalui REST API Supabase dan mengelola login sendiri dengan username/password serta session cookie HttpOnly. `SUPABASE_PUBLISHABLE_KEY` dan JWKS URL tidak dipakai oleh alur ini; jangan gunakan publishable key sebagai pengganti secret key server.

Project yang dikonfigurasi untuk deployment: `https://tfepouzhcpaugfcgrekl.supabase.co`. Pemeriksaan REST menemukan tabel `public.profiles` belum ada pada project tersebut. Karena itu database belum siap untuk login sampai migrasi di folder `supabase/migrations/` diterapkan secara berurutan.

## Konfigurasi deployment

Tambahkan environment variable berikut di environment server (bukan di frontend atau source control):

```text
SUPABASE_URL=https://tfepouzhcpaugfcgrekl.supabase.co
SUPABASE_SECRET_KEY=<secret key dari Supabase Project Settings > API Keys>
ADMIN_USERNAME=<username admin>
ADMIN_PASSWORD=<password admin minimal 6 karakter>
```

`SUPABASE_SECRET_KEY` bersifat rahasia, memberi akses server berprivilege tinggi, dan harus disimpan hanya sebagai server-side secret. Jangan memakai prefix `VITE_`, memasukkannya ke source code, atau mengirimkannya ke browser. `SUPABASE_SERVICE_ROLE_KEY` legacy masih didukung oleh kode demi kompatibilitas, tetapi konfigurasi baru sebaiknya menggunakan `SUPABASE_SECRET_KEY`. Setelah mengubah environment variable, redeploy/restart server.

## Menerapkan schema

Gunakan Supabase CLI dengan project ref `tfepouzhcpaugfcgrekl`, tautkan repository ini ke project baru, lalu jalankan `supabase db push` agar seluruh file migrasi berjalan sesuai urutan timestamp. Perintah tersebut membutuhkan autentikasi Supabase CLI dan password database; API secret key saja tidak dapat menjalankan migrasi DDL.

Migrasi membuat dan memperbarui `app_settings`, `profiles`, `sessions`, `deposits`, dan `withdrawals`, mengaktifkan RLS, serta menambahkan fungsi/database constraints yang diperlukan. Pastikan proses migrasi berakhir sukses sebelum mencoba login. Key dalam chat sebaiknya dirotasi di Supabase Dashboard karena secret key yang sudah dibagikan tidak lagi sepenuhnya rahasia; simpan key pengganti hanya di environment deployment.

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
