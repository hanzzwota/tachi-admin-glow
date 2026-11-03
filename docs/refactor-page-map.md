# Pemetaan Halaman untuk Refactor

Dokumen ini mencatat struktur halaman dan batas tanggung jawab file. Perubahan tahap ini hanya menyentuh struktur UI dan routing halaman; API dan database tetap dipertahankan.

## Status setelah pemisahan halaman awal

- Isi setiap view sudah diekstrak ke dokumen sendiri di `public/pages/`: `login.html`, `register.html`, `dashboard.html`, `setor.html`, `saldo.html`, `profil.html`, dan `riwayat.html`.
- `public/app.html` kini hanya menjadi redirect kompatibilitas untuk tautan lama seperti `/app.html?view=stor`; dokumen itu tidak lagi menampung seluruh UI.
- Setiap halaman mandiri memuat satu view. Semuanya menggunakan aset bersama `public/app.css`, `public/app-shell.js`, `public/app-runtime.js`, `public/app-modal.js`, `public/api-client.js`, dan `public/toast.js`.
- `src/components/StaticPageFrame.tsx` menghubungkan route pengguna ke HTML yang sesuai melalui iframe; view `stor` dipetakan ke `setor.html`. Navigasi dalam iframe tetap diarahkan ke route ekstensi-free pada window teratas.
- Alias lama seperti `public/login.html` dan `public/setor.html` sekarang mengalihkan ke route ekstensi-free yang sesuai.
- Route root `/` membuka dokumen dashboard mandiri. `src/routes/admin.tsx` tetap memakai `AdminPageFrame` untuk `public/admin.html`.

## Peta halaman dan tanggung jawab

| Halaman | Route utama | Konten/aksi |
| --- | --- | --- |
| Masuk | `/login` | Form username/password, validasi, submit login, navigasi ke daftar |
| Daftar | `/register` | Form pembuatan akun, validasi, submit register, navigasi ke masuk |
| Dashboard | `/dashboard` | Sapaan akun, saldo/ringkasan, pengumuman, link dukungan dan pintasan navigasi |
| Setor Gmail | `/setor` | Form daftar Gmail, aturan/pengingat, status fitur dan submit transaksi |
| Saldo | `/saldo` | Saldo, metode pembayaran, formulir/konfirmasi penarikan |
| Profil | `/profil` | Informasi akun, pengaturan data profil/rekening dan aksi akun |
| Riwayat | `/riwayat` | Daftar setoran, filter status, detail hasil/verifikasi |
| Admin | `/admin` | Antrean setoran, penarikan, user, pengaturan; sumber terpisah di `public/admin.html` |

## Batas tanggung jawab file bersama

- `public/toast.js`: notifikasi global; dipakai halaman pengguna dan admin.
- `public/app.css`: stylesheet aplikasi pengguna yang diekstrak dari `app.html`.
- `public/app-shell.js`: membuat navigasi bawah bersama dari mount point setiap halaman.
- `public/app-runtime.js`: helper interaksi pengguna dan navigasi legacy yang digunakan tiap dokumen halaman.
- `public/app-modal.js`: komponen modal pengguna. ID `appModal`, `modalTitle`, dan `modalBody` dipertahankan karena API client mengaksesnya. `openModal` menulis teks; API client dapat tetap mengisi isi HTML konfirmasi seperti sebelumnya.
- `public/api-client.js`: state pengguna, sinkronisasi UI, dan permintaan ke endpoint `/api/*`. DOM halaman yang tidak tersedia diabaikan pada update bersyarat.
- `public/admin-api.js`: API client admin, terpisah dari client pengguna.
- `public/admin.html`: memiliki modal admin tersendiri. Modal ini belum digabung karena bentuk dialog dan cara mengisi kontennya berbeda.

## Tahap lanjutan

1. Jalankan build dan smoke test untuk route langsung; perbaiki ketidakcocokan DOM bila ditemukan.
2. Pertimbangkan menghilangkan iframe dari `StaticPageFrame` setelah komponen halaman menjadi route React langsung dan perilaku cookie/navigasi tervalidasi.
3. Pecah `api-client.js` menjadi modul lebih kecil hanya bila diperlukan; pertahankan kontrak endpoint `/api/*`.
4. Pertahankan redirect alias dan `app.html` sampai tautan lama tidak lagi digunakan; keduanya kini hanya mengarahkan ke route terpisah.
5. Migrasi database ke Lovable Cloud adalah pekerjaan terpisah dan belum dilakukan.
