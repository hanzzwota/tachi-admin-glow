# Rencana implementasi: sinkronisasi harga PW/CAPTCHA

## Pendekatan

Pertahankan aplikasi TanStack/Vite yang ada, API server, autentikasi, dan Supabase `app_settings` sebagai sumber tunggal konfigurasi. Tambahkan kolom `pw_rate` dan `captcha_rate` melalui migrasi aditif, dengan nilai awal berasal dari `rate` agar konfigurasi lama tetap kompatibel. API admin membaca dan memvalidasi dua nilai integer non-negatif; API setoran menerima hanya mode PW atau CAPTCHA yang valid, memeriksa sakelar mode di server, memilih harga dari kolom yang cocok, lalu menyimpan snapshot harga pada transaksi. Nilai mode dan harga dari browser tidak dipercaya.

Perbarui form admin agar mengatur harga PW dan CAPTCHA secara terpisah dan benar-benar menyimpan perubahan melalui endpoint admin yang sudah ada. Perbarui dashboard user agar mengambil harga yang sama dari endpoint settings tanpa cache, menampilkan harga sesuai mode terpilih, dan mencegah perubahan pilihan ketika pengiriman berjalan.

## Struktur proyek

- `supabase/migrations/`: migrasi aditif untuk kolom harga per mode.
- `src/routes/api/$.ts`: validasi dan pemetaan konfigurasi server, termasuk pencatatan snapshot harga transaksi.
- `public/admin.html` dan `public/admin-api.js`: form dan state konfigurasi admin.
- `public/api-client.js` dan `public/app.html`: render harga/mode, status aktif, dan interaksi submit.
- `plan.md` dan `TODO.md`: keputusan desain serta kemajuan.

## Desain

Pertahankan bahasa visual aplikasi yang sudah ada. Kartu pilihan mode memakai gaya navy ringkas: dasar `#1E293B`, isian berkontras `#171F32`, dan outline aktif 2px `#38BDF8` dengan glow halus. Kedua kartu berukuran dan berjarak seragam, status aktif ditunjukkan hanya pada pilihan yang sedang terpilih, dan tombol dinonaktifkan saat permintaan setoran berlangsung. Form admin tetap mengikuti gaya konsol yang telah ada.

## Batasan dan validasi

Tidak mengubah autentikasi atau deployment aplikasi. Migrasi harga telah diterapkan ke backend Supabase `ryuu` (`eiwjpbfkxmtytmtiqpfj`) setelah verifikasi proyek dan riwayat migrasi. Tes lokal yang tersedia (3/3), build produksi, dan pemeriksaan sintaks JS/HTML lulus. Lint dan type-check keseluruhan masih melaporkan masalah baseline pada bagian lain repository; tidak ditemukan diagnostik type-check pada field harga baru.
