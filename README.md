# Forever in Love Template 1 — Wedding Invitation & Wedding Desk

Frontend dan backend berjalan pada **proyek Vercel yang sama**, dengan Supabase Postgres serta Supabase Storage. UI undangan dan fitur CMS/Wedding Desk dipertahankan. Semua rewrite runtime bersifat internal; tidak ada proxy atau fallback ke host lama.

**Produksi belum boleh dialihkan sebelum environment, backup, seluruh media, dan acceptance Preview terverifikasi.** Panduan lengkap, inventaris dependensi, baseline, serta rollback ada di [dokumen migrasi](docs/vercel-supabase-migration.md). Riwayat insiden terdahulu tetap ada di `docs/incident-2026-10-30.md`.

Bukti gerbang release 30 Oktober: [hosted, media dan akses Kamboja](docs/release-gates-2026-10-30.md). Status deployment/cutover terakhir dicatat pada [PR #3](https://github.com/slaks37/stefen-jessica-wedding/pull/3).

## Struktur

- `api/backend.js`: fungsi Vercel Node.js 24, semua metode HTTP.
- `server/vercel.js`: routing, metadata tepercaya, sanitasi identitas, lifecycle tugas background.
- `server/storage.js`: adapter Supabase Storage private/public delivery.
- `worker/`: logika bisnis yang digunakan kembali sebagai modul lokal, bukan runtime remote.
- `public/`: frontend, foto statis, animasi, dan halaman sumber.
- `dist/client`: output publik; tidak berisi HTML shell admin.
- `dist/server-assets`: HTML privat yang dibundel ke fungsi.
- `supabase/functions/wedding-db`: transport SQL server dengan allowlist yang tetap dipertahankan.
- `supabase/functions/wedding-storage`: gateway token server terbatas ke bucket pernikahan; service-role tetap di Supabase.
- `drizzle/`: SQLite untuk pengujian/dev, tidak dideploy sebagai database produksi.
- `scripts/migrate-media.mjs`: inventory dan penyalinan R2 hanya untuk migrasi.

## Environment

Lihat nama variabel dalam `.env.example`; semua nilai sensitif berada pada environment **server Vercel**. Jangan menaruh token, service role, atau key AI di browser, Git, atau chat. Database tetap proyek `lgwrwymrjcptoztjvbxz`. `SUPABASE_STORAGE_KEY` memakai token gateway server yang terbatas, bukan service-role browser. Token Preview mengakses schema `wedding_preview` dan bucket `wedding-qa-*`; token Production mengakses data produksi yang sama seperti sebelumnya. Kredensial/helper R2 hanya untuk migrasi, tidak dibaca aplikasi produksi.

## Pengembangan dan pengujian

Gunakan Node.js 24.

```sh
npm ci
npm run dev
```

Preview lokal: `http://127.0.0.1:4173/`, CMS `/admin`, kode khusus lokal `local-wedding-test-code-123456`. Database dan berkas lokal di `.local/` terpisah dari produksi. Tidak ada kredensial admin produksi bawaan.

```sh
npm run build
npm test
npm run test:browser
npm audit --omit=dev
npm run release:check
```

Playwright menjalankan Chrome desktop dan emulasi mobile terhadap adapter Vercel dengan database in-memory. Itu bukan pengujian HP fisik atau jaringan seluler. `release:check` membutuhkan backup privat, environment, serta media manifest yang benar; tidak meloloskan konfigurasi placeholder.

## Fitur tetap

Jadwal dapat diubah lewat **CMS → Detail acara**: pilih tanggal, jam mulai dan jam selesai (WIB) pada Resepsi I/II, lalu **Simpan detail acara**. Data tersimpan di settings database dan dipakai untuk kartu acara, RSVP, countdown serta tautan Google Calendar/berkas ICS yang dibuat berikutnya. Acara yang sudah diimpor ke kalender pribadi sebelumnya tidak diperbarui otomatis.

Tautan personal dan sapaan, pembatasan acara/kursi, RSVP per acara, kalender, galeri/lightbox, animasi, bahasa Indonesia/Inggris, pesan asli dan terjemahan/moderasi opsional, gift/heart/scroll tracking, bulk CSV, manajemen meja, check-in/seating/souvenir, serta rundown keluarga/teapai/foto tetap memakai logika dan data lama. Bukti hadiah tetap privat; konfirmasi hadiah bukan transaksi bank.

Admin memakai kode dan cookie HMAC Secure/HttpOnly. Guest token dan slug tidak diganti. CSRF, rate limit, no-store, akses media privat, serta SQL allowlist tetap diterapkan. Header identitas platform dari request publik tidak memberi akses admin.
