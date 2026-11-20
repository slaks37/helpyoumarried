# Bukti gerbang cutover — 30 Oktober 2026

Dokumen ini menggantikan status blocker historis pada laporan awal. Cutover hanya dilakukan setelah CI untuk source akhir lulus; hasil deployment dan smoke produksi dicatat pada PR #3.

## Perubahan yang disetujui

Pemilik secara eksplisit menyetujui schema QA privat dan dua hash token server baru, deployment function `wedding-db`, gateway `wedding-storage` dengan autentikasi token server 256-bit, helper ekspor R2 read-only sementara pada Sites, serta pengecualian publik terbatas pada satu deployment QA untuk probe regional.

`wedding-db` mempertahankan SQL allowlist dan token Sites lama. Token Preview membatasi seluruh tabel aplikasi ke `wedding_preview`; token runtime baru tetap memakai data `public`. Schema QA hanya menyalin settings CMS publik dan fixture sintetis. Tidak ada guest access token yang diputar.

Service-role Storage tidak diekspor: hanya function Supabase `wedding-storage` yang membacanya dari environment bawaan. Vercel memegang capability server terbatas ke empat bucket pernikahan. Token Preview selalu dipetakan ke empat bucket `wedding-qa-*`. Seluruh bucket private; signed upload hanya berlaku untuk satu objek staging, kemudian isi/ukuran/pemilik diperiksa sebelum finalisasi.

Secret sesi baru diperlukan karena nilai lama tidak dapat dibaca dari Sites. Dampak cutover: admin perlu login ulang memakai kode yang sama; hash pengunjung anonim berubah. Cookie akses tamu dan tautan personal tetap valid karena access token undangan tidak berubah. Historical activity tetap disimpan.

## Data dan media

| Pemeriksaan | Hasil |
|---|---|
| Backup baru | 2026-10-30 14:53:37 UTC / 21:53:37 WIB |
| Privasi backup | OpenPGP dienkripsi di PostgreSQL memakai public key lokal; hanya ciphertext keluar lewat tool; private key dan JSON hasil dekripsi berada di `.local/backups/` mode privat |
| Verifikasi pemulihan | Checksum seluruh 15 tabel; restore 14 tabel aplikasi, 760 baris, dengan foreign key aktif dalam database terisolasi |
| Baseline | 150 undangan, 37 RSVP, 5 hadiah, 10 pesan, 2 settings; 261 opens, 243 reading-progress |
| Kursi | 297; perubahan 296 → 297 terjadi saat produksi lama aktif, tidak dibatalkan |
| Inventory R2 penuh | 49 objek, 204.825.858 byte, dibaca lewat binding `BUCKET` situs sumber yang sama, tanpa mengasumsikan kepemilikan akun Cloudflare lain |
| Transfer Supabase | 49/49 diverifikasi SHA-256, ukuran dan MIME, dengan 21 referensi CMS terpenuhi |
| Source recheck | 2026-10-30 14:42:39 UTC: key/ukuran/ETag inventory tetap sama |
| Sumber asli | Tidak dihapus atau ditimpa; tetap untuk rollback |

Backup baru menangkap peningkatan aktivitas alami sejak snapshot awal, bukan mereset statistik ke snapshot lama. Pengujian hosted tidak menulis RSVP atau statistik untuk undangan asli.

## Acceptance hosted

- 13 pemeriksaan API pada Preview nyata: penolakan anonim, create/edit/nonaktif/hapus fixture, token-cookie, event/kursi, RSVP retry dan update, persistensi CMS, multiundangan teapai, check-in/seating/souvenir, signed proof upload dan pembacaan privat admin dengan hash byte cocok.
- 8 pemeriksaan browser Chrome terhadap Preview nyata: desktop dan mobile emulation; greeting/event sesuai, RSVP hadir/tidak hadir/persist/celebration, kalender ICS H-7/H-1/1 jam, lightbox, layout, original pesan dan terjemahan OpenAI nyata, spam hanya terlihat pengirim, foto CMS 4.832.170 byte melalui signed upload lalu disimpan, login/logout dan Wedding Desk, landing umum hanya Resepsi II, ID/EN, tanpa request runtime ke origin lama atau error konsol.
- Perbaikan nyata: validator upload browser kini menerima bucket staging Production **dan** QA pada proyek tetap; bucket/project lain ditolak. Driver browser menunggu render locale selesai dan memilih tombol logout secara spesifik.
- Kode admin di skrip acceptance dipindahkan ke file input privat; tes unit memakai nilai sintetis yang berbeda dari kode produksi.

Google Calendar URL dan ICS diverifikasi; penyimpanan ke akun Google nyata serta default notifikasi akun tidak diuji. Mobile adalah emulasi viewport/touch, bukan bukti HP fisik, WhatsApp atau Instagram.

## Verifikasi internasional sebelum cutover

48 probe pada deployment QA yang diizinkan publik sementara: landing, locale, content, exchange token sintetis, HTML personal, API personal dengan cookie sintetis, foto dan canonical redirect. Tidak ada token tamu asli atau secret Vercel dibagikan ke penyedia probe.

| Jaringan | Hasil pada delapan probe per jaringan |
|---|---|
| Kamboja — Cogetel AS23673 | PASS; API/media yang sebelumnya 403 kini 200, cookie diterbitkan dan diterima |
| Kamboja — Smart Axiata AS45498 | PASS |
| Kamboja — CAMGSM AS17976 | PASS |
| Kamboja — LIGHT NODE AS154177 | PASS, datacenter |
| Singapura — LeaseWeb AS59253 | PASS, datacenter |
| Indonesia — Telekomunikasi Indonesia AS7713 | PASS |

Locale jaringan KH/SG menghasilkan English dan ID menghasilkan Indonesia. ASN/lokasi adalah provenance penyedia probe; eyeball-network tidak disamakan dengan ponsel fisik.

Pengecualian publik QA telah dicabut. Probe anonim eksternal setelah pencabutan (ID `2ge6ypM2DMDBEt65L00021Pd0`) mendapat 302 menuju proteksi Vercel; konfigurasi proyek tetap `all_except_custom_domains`. Domain produksi tidak dialihkan untuk pengujian ini.

## Urutan release dan rollback

1. Konfigurasikan tujuh environment Production di proyek yang sama; hanya kredensial runtime yang menggunakan schema/bucket produksi.
2. Jalankan `release:check` dengan backup di atas, manifest transfer lengkap, dan environment proses privat; CI akhir wajib lulus.
3. Merge PR #3 dan verifikasi deployment Production pada domain yang sama. Smoke produksi hanya read-only/owner admin; jangan replay token tamu atau membuat fixture di `public`.
4. Bandingkan fingerprint/totals dengan backup, dengan mempertimbangkan kunjungan alami. Jalankan probe regional publik pada domain utama untuk memastikan API/media tidak lagi menerima blok upstream.
5. Nonaktifkan helper ekspor Sites setelah selesai; pertahankan Sites versi 47 serta R2 untuk rollback, tanpa normal production traffic.

Rollback sebelum ada upload baru: kembalikan deployment Vercel `dpl_53hrbJUg2PbvQ9iu9jWwV9pGVqBZ`; Sites versi 47 dan 49 objek R2 tetap tersedia. Tidak ada perubahan tabel aplikasi produksi yang perlu di-reset. Jika sudah ada upload baru di Supabase, salin objek baru ke sumber rollback terlebih dahulu dan verifikasi path/checksum; jangan mengalihkan lalu meninggalkan media baru. Jangan menghapus sumber lama otomatis.
