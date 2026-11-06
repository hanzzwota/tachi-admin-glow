# Performance Audit & Implementation Report

Tanggal audit: 2026-11-06

## Perubahan yang diimplementasikan

- `public/api-client.js`
  - Menyatukan GET request yang identik ketika beberapa pemicu (interval, focus, pageshow, atau navigasi) berjalan bersamaan.
  - Menambahkan `window.tachiPerformance` yang menyimpan maksimal 100 sampel latency GET tanpa payload atau data sensitif.
  - Menambahkan coalescing pada `syncAppData()` agar hanya satu sinkronisasi user aktif pada satu waktu.
  - Menghapus auto-refresh leaderboard berkala. Data dimuat saat halaman dibuka, periode diganti, atau refresh manual ditekan.
- `public/admin-api.js`
  - Menyatukan GET request admin yang identik ketika polling atau refresh setelah aksi bertumpuk.
  - Menambahkan `window.tachiAdminPerformance` untuk sampel latency GET admin tanpa payload sensitif.
- `src/server/supabase.ts`
  - Menambahkan logging latency query yang opt-in melalui `SUPABASE_PERF_LOG=1`.
  - Log hanya berisi method, resource tanpa query string, HTTP status, dan durasi; tidak mencatat token, payload, password, atau identitas user.
- `public/app.html`
  - Tombol refresh leaderboard memakai mode force refresh.
- `.env.example`
  - Mendokumentasikan `SUPABASE_PERF_LOG=0`.

## Hasil validasi lokal

| Pemeriksaan | Hasil |
|---|---|
| `pnpm run build` setelah perubahan | Lulus |
| `pnpm test` setelah perubahan | Lulus |
| `node --check public/api-client.js` | Lulus |
| `node --check public/admin-api.js` | Lulus |
| `git diff --check` | Lulus |
| `pnpm run lint` | Lulus dengan 6 warning baseline `react-refresh/only-export-components` pada komponen UI; tidak ada error pada file perubahan |

## Temuan performa yang dapat dibuktikan dari source

Sebelum perubahan, beberapa pemicu dapat memanggil endpoint yang sama secara bersamaan: sinkronisasi user dipicu oleh interval 20 detik, `visibilitychange`, `focus`, dan `pageshow`; pembukaan leaderboard juga selalu melakukan fetch. Backend sudah memakai `Promise.all` pada beberapa endpoint dan leaderboard memiliki RPC agregasi, sehingga perubahan dipusatkan pada deduplikasi request di client.

Setelah perubahan, request GET identik yang masih in-flight dibagikan ke semua pemanggil. Leaderboard tidak lagi melakukan polling otomatis; saat dibuka kembali, periode diganti, atau refresh manual ditekan, endpoint mengambil data terbaru sehingga hasil approval admin akan terlihat pada pengambilan berikutnya. Pengukuran aktual request/query production belum dapat dibandingkan dari sandbox ini karena tidak ada sesi database production dan tidak ada browser user/admin yang terautentikasi.

## Hal yang belum dapat diklaim

- Tidak ada angka request, payload, query, atau latency production sebelum/sesudah karena environment ini tidak memiliki cookie login dan secret database production.
- RLS, execution plan, locking, serta migrasi RPC harus diverifikasi pada project Supabase deployment yang sebenarnya.
- Alur withdrawal masih menggunakan endpoint multi-step yang sudah memiliki optimistic balance guard pada pembuatan withdrawal, tetapi approval/rejection payout tetap perlu RPC atomik khusus sebelum skala besar.

Untuk pengukuran deployment, aktifkan `SUPABASE_PERF_LOG=1` sementara, buka dashboard/leaderboard/admin, kumpulkan log provider, lalu matikan kembali setelah pengukuran selesai.
