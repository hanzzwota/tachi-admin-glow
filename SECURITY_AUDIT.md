# Laporan Audit Security & Kesiapan Launch

Tanggal audit: 2026-10-13

## Ringkasan status

Perbaikan kode sudah diterapkan untuk kontrol akses tombol admin, konfirmasi wallet sebelum penarikan, rate limiting dasar, batas harian setoran, dan fungsi pengurangan stok Gmail. RLS Supabase sudah diaktifkan pada seluruh tabel aplikasi di migrasi yang ada. Deployment tetap membutuhkan konfigurasi hard-cap dan alert di provider cloud karena batas biaya tidak dapat dijamin hanya dari kode aplikasi.

## Temuan dan tindakan

### 1. Rate limiting endpoint krusial — **Tinggi, diperbaiki sebagian**

Sebelumnya endpoint login, registrasi, setoran, wallet, penarikan, stok, dan pengaturan admin tidak memiliki rate limit aplikasi. Ini membuka risiko brute-force, spam transaksi, dan pemakaian resource berlebihan.

Perbaikan: `src/server/rate-limit.ts` menambahkan pembatas per alamat client dengan pembersihan bucket dan batas jumlah bucket. Handler menerapkan limit pada login, register, deposits, withdrawals, wallet, stock claim, dan admin settings.

Batasan: map in-memory tidak konsisten antar instance serverless dan dapat reset saat cold start. Sebelum launch, tambahkan rate limit edge/WAF berbasis provider atau Redis/Upstash yang dibagi antar instance. Login juga sebaiknya memakai CAPTCHA setelah beberapa kegagalan.

### 2. Batas biaya dan pemanggilan backend — **Tinggi, mitigasi kode diterapkan; hard cap masih wajib di provider**

Tidak ditemukan `while` tanpa kondisi berhenti, recursive fetch, atau integrasi AI/eksternal berbayar di source. Polling user/admin dibatasi 20/15 detik dan hanya aktif ketika tab terlihat. Semua query utama memiliki limit, tetapi endpoint admin masih dapat mengambil hingga 500 baris per request.

Perbaikan: polling memakai guard request-in-flight, batas harian setoran diberlakukan server-side, dan rate limiting ditambahkan. Migrasi baru memperbaiki fungsi stok atomik agar item stok benar-benar dikeluarkan.

Wajib sebelum launch: pasang budget hard cap/spending limit di Vercel/Supabase/provider, alert 50/80/100%, dan aturan otomatis untuk menonaktifkan fitur mahal atau memblokir deployment/traffic saat cap tercapai. Alert saja tidak cukup. Tambahkan dashboard metrik untuk request 4xx/5xx, latency, database egress, dan jumlah klaim stok.

### 3. RLS Supabase — **Baik pada migrasi, perlu verifikasi deployment**

Migrasi mengaktifkan RLS pada `app_settings`, `profiles`, `sessions`, `deposits`, dan `withdrawals`. Tidak ada policy publik, sehingga akses browser langsung tidak diberikan. Server menggunakan service-role key sehingga semua otorisasi berada di endpoint server.

Risiko residual: service-role key melewati RLS. Pastikan key hanya ada di environment server dan tabel tidak pernah diakses langsung dari frontend. Jalankan verifikasi SQL di project produksi:

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

Semua tabel aplikasi harus bernilai `true`. Audit juga `pg_policies` dan pastikan tidak ada policy `anon`/`public` yang memberikan akses tulis ke saldo, session, setoran, atau penarikan.

### 4. Secret/API key — **Baik dengan catatan**

`SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_USERNAME`, dan `ADMIN_PASSWORD` dibaca dari environment server dan tidak ditemukan di frontend source. `.env` tidak masuk repository; `.env.example` hanya berisi placeholder.

Tetap lakukan secret scanning CI, blokir file `.env*` selain `.env.example`, dan rotasi service-role key bila pernah tertempel di log, screenshot, issue, atau chat. Jangan menaruh key dengan prefix `VITE_`.

### 5. Kebocoran konfigurasi settings — **Tinggi, sudah diperbaiki pada commit sebelumnya**

Versi lama mengembalikan `campaign_password` dan stok Gmail dari `/api/settings` tanpa login. Endpoint sekarang memerlukan session, dan stok Gmail disembunyikan dari user biasa. Setelah setiap deployment, uji unauthenticated request harus mendapatkan `401`.

### 6. Wallet dan penarikan — **Sedang, diperbaiki**

UI sekarang menampilkan peringatan abu-abu:

> Jika Nomor Salah/Tidak Sesuai Dengan Nomor Payment Anda Admin Tidak Berhak Bertanggung Jawab.

Sebelum request penarikan, user wajib mengonfirmasi nomor wallet yang tersimpan. Backend juga menolak request tanpa `confirmWallet: true` dan selalu membaca wallet dari profile server, bukan mempercayai nomor dari browser.

Catatan: konfirmasi UI bukan pengganti verifikasi kepemilikan rekening. Untuk nominal besar, pertimbangkan OTP atau verifikasi manual sebelum payout.

### 7. Sesi saat refresh — **Baik**

Session disimpan sebagai cookie `HttpOnly; Secure; SameSite=None` dengan TTL 30 hari. Polling tidak melakukan logout dan refresh halaman memanggil `/api/auth/me`; selama cookie belum kedaluwarsa atau dihapus admin, user/admin tetap login. Jangan menghapus cookie pada error API biasa; hanya endpoint logout yang menghapusnya.

### 8. Integritas transaksi — **Perlu peningkatan sebelum skala besar**

Approval deposit, perubahan saldo, dan proses withdrawal dilakukan melalui beberapa request REST terpisah. Dua admin atau retry bersamaan dapat menyebabkan race condition saldo. Gunakan PostgreSQL function/transaction atomik untuk approve deposit, create withdrawal, dan process withdrawal dengan row lock/idempotency key. Tambahkan unique/idempotency protection untuk request transaksi.

### 9. Input dan observability — **Sedang**

Validasi dasar email, nominal, wallet, batch, dan panjang teks sudah ada. Tambahkan batas ukuran body request di server, audit log immutable untuk perubahan saldo/settings, alert untuk lonjakan 401/403/429, dan sanitasi log agar password/token tidak pernah tercatat.

## Checklist sebelum launch

- [ ] Budget hard cap provider aktif, bukan hanya alert.
- [ ] Verifikasi `rowsecurity = true` untuk seluruh tabel produksi.
- [ ] Secret scanning CI aktif.
- [ ] Rate limit edge/shared-store aktif di luar limiter in-memory.
- [ ] CAPTCHA/lockout untuk login berulang.
- [ ] Transaction function/idempotency untuk perubahan saldo.
- [ ] Monitoring dan alert 4xx/5xx, 429, database egress, dan payout.
- [ ] Uji `/api/settings`, `/api/admin/*`, dan `/api/withdrawals` tanpa cookie.
- [ ] Uji refresh halaman user dan admin tanpa login ulang.
