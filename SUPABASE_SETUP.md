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

## Harga per jalur setoran

Sebelum merilis versi aplikasi yang memakai harga per mode, terapkan migrasi `supabase/migrations/20261104100000_pw_captcha_rates.sql` ke database Supabase melalui prosedur rilis yang berwenang. Migrasi menambah `app_settings.pw_rate` dan `app_settings.captcha_rate`, masing-masing diinisialisasi dari nilai `rate` yang lama. Dashboard admin menjadi sumber konfigurasi; endpoint setoran memilih harga di server dan menyimpan snapshot pada setiap transaksi.

## Login OTP email

Terapkan migrasi `supabase/migrations/20261107130000_email_registration_otp.sql`. Tambahkan secret server `RESEND_API_KEY` dan `AUTH_EMAIL_FROM` (alamat pengirim/domain yang sudah diverifikasi di Resend). Pendaftaran baru wajib mengisi email unik. OTP 6 digit dikirim ke email saat registrasi dan akun baru dibuat setelah OTP terverifikasi; OTP berlaku 10 menit (maksimal 5 percobaan). Login tidak meminta OTP. User dapat mengganti password dari menu profil, dan admin dapat menetapkan password pilihan saat reset di pengaturan user.

Akun lama tetap dapat login seperti sebelumnya; OTP hanya diterapkan pada pendaftaran baru. Jangan masukkan nomor WhatsApp ke kolom `profiles.email`.
