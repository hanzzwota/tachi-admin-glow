# Tachi Admin Glow

Buatkan aplikasi Dashboard Admin berbasis Web (Single Page Application / Full-Stack) untuk mengelola platform "tachi69gmail" yang menyatu secara visual, tema UI/UX, dan logika data dengan antarmuka aplikasi User tachi69gmail.



---



### 1. TEMA & DESIGN SYSTEM (Wajib Presisi dengan App User)

- **Primary Style:** Modern Soft-Glassmorphic / Neumorphism Light Mode bertema Biru & Putih.

- **Color Palette:**

  - Background Utama: Gradien lembut (`bg-gradient-to-br from-blue-50 via-slate-50 to-blue-100`).

  - Card & Container: Putih semi-transparan (`bg-white/80 backdrop-blur-md border border-white/60 shadow-lg shadow-blue-500/5`).

  - Button Primary: Gradien Biru Glossy (`bg-gradient-to-r from-blue-600 to-indigo-600`).

  - Indikator Status: Hijau (Diterima / Fitur Buka), Kuning/Orange (Pending), Merah (Gagal / Fitur Ditutup).

- **Branding & Logo:** 

  - Logo URL: https://files.catbox.moe/dysigb.jpeg (3D Emblem, Statis / Animasi Muter Dimatikan).

  - Nama Brand: "tachi69gmail Admin Console".

- **Kredensial Login Default Admin:**

  - Username: ryueiei

  - Password: Hanzz0508



---



### 2. KONTEKS PLATFORM & REGULASI SISTEM (Penting!)

- **Penerimaan Setoran Gmail (Bukan Jual/Beli):** Hapus semua istilah/mode "Beli Gmail". Platform ini murni merupakan portal di mana user menyetor daftar akun Gmail ke admin untuk diverifikasi.

- **Multi-Submission:** 1 akun user dapat membuat banyak transaksi setoran secara independen.

- **Batas Input Setoran (Anti-Spam / Hemat Tempat):** Batasi maksimal 50 akun Gmail per 1 kali kirim/submit transaksi setoran untuk mencegah penumpukan data.

- **Sistem Fitur On/Off (Global Toggle Switch):** Admin dapat menutup/membuka fitur "Stor Gmail" dan "Tarik Saldo" secara real-time yang langsung berdampak pada akses antarmuka User.



---



### 3. FITUR UTAMA DASHBOARD ADMIN



#### A. Header & Akses Login

- Indikator Status Akun Admin (`Logged in as: ryueiei`).

- Quick Switch View ke User Mode & Tombol Logout.

- Ringkasan Statistik Real-time (Total Setoran Pending, Total Gmail Diterima Hari Ini, Total Saldo Tersedia vs Dicairkan).



#### B. Fitur Kontrol System Settings (Sakelar Buka/Tutup)

- **Toggle Feature "Stor Gmail":** Buka/tutup akses setoran Gmail. Jika OFF, halaman Stor di User App terkunci dan menampilkan status "Setoran Ditutup oleh Admin".

- **Toggle Feature "Tarik Saldo":** Buka/tutup akses penarikan. Jika OFF, form penarikan di User App terkunci dengan status "Penarikan Ditutup".

-fitur checker buka tutup

- **Form Configuration Parameter:**

  - Input Rate Setoran per Gmail (Default: Rp4.500).

  - Input Minimal Tarik Saldo (Default: Rp4.000).

  - Input Password Kampanye Wajib (Default: `sgsg1122`).

  - Input Limit Maksimal Akun per Transaksi (Default: 1 akun).

  - Editor Text Pengumuman Running/Slide di Dashboard User.

  - Max Setor Hari Ini Riset Setiap jam 00:00Wib



#### C. Kelola Setoran Gmail (Verifikasi Setoran, Search & Alasan Penolakan)

- **Bar Pencarian (Search Bar) & Filter Gmail:**

  - Search input untuk mencari email Gmail spesifik, username user, atau ID transaksi secara instan/real-time.

  - Filter Status: Semua, Pending, Diterima, Ditolak.

- **Tabel Antrean Setoran:**

  - Displays ID Setoran, Tanggal, Username User, Total Gmail Disetor, Status, dan Tombol Aksi.

- **Modul Aksi Verifikasi Admin:**

  - **Tombol ACC / Terima:** Masukkan jumlah Gmail yang valid. Saldo user otomatis bertambah sebesar `(Jumlah Diterima x Rate)`. Status di Riwayat User berubah jadi "Diterima".

  - **Tombol Tolak (Reject Modal Window):** Saat diklik, tampilkan Pop-up Modal khusus untuk memilih alasan penolakan:

    - Option List:

      1. Captcha

      2. Disable

      3. Unregist

      4. Error

      5. Alasan Lain (Menampilkan Textarea input manual jika admin mengisi alasan kustom).

    - Alasan penolakan ini wajib disimpan dan ditampilkan secara detail di menu Riwayat Setoran User.



#### D. Kelola Penarikan Saldo (Payout Request)

- Tabel Permintaan Tarik Saldo User (Username, Nama Pemilik, E-Wallet DANA, Nominal, Fee Admin, Total Transfer, Status).

- Fitur Salin / Copy Nomor Rekening dengan 1-klik.

- Aksi ACC Pencairan (Ubah status ke "Selesai") atau Tolak Penarikan (Kembalikan saldo ke akun user). tolak beri kolom alasan 



#### E. Management Data User

- Tabel Daftar User Terdaftar beserta Riwayat Setoran, Total Saldo, Rekening Bank/E-Wallet, dan Status (Reguler / VIP).

- Fitur Edit Saldo Manual (Tambah/Kurang Saldo Koreksi) & Reset Password User.



---



### 4. OUTPUT FORMAT & ARSITEKTUR KODE

- Sediakan kode lengkap berupa Single File HTML (termasuk CSS Tailwind via CDN & JavaScript Vanilla) yang responsive, rapi, serta menggunakan UI/UX modern.

- Masukkan  logika JavaScript/State Management agar alur kerja (User Setor ± 50 Akun -> Masuk Antrean Admin -> Admin Search / Verifikasi -> Penolakan dengan Alasan Captcha/Disable/Lainnya -> Status Terupdate di User) .

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://tachi-admin-glow.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0b179ad3-a06d-4b52-a7c3-e239be671687).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
