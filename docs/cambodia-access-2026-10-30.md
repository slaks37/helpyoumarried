# Insiden akses Kamboja dan kelanjutan migrasi — 30 Oktober 2026

Status saat audit awal: **BLOCKED** (historis). [Bukti gerbang release terbaru](release-gates-2026-10-30.md) mencatat penyelesaian konfigurasi, media, hosted acceptance dan tes ulang jaringan Kamboja. Laporan di bawah mempertahankan evidence diagnosis awal.

## A. Diagnosis akses Kamboja

### Temuan terkonfirmasi

Pengujian Globalping memakai empat ASN di Phnom Penh, ditambah kontrol Singapura dan Indonesia. Total 13 measurement berisi 64 hasil probe; tidak ada request ke slug personal, token tamu, RSVP produksi, atau endpoint pencatatan kunjungan. Lokasi/ASN adalah metadata penyedia probe, bukan hasil simulasi user-agent.

| Tahap | Bukti |
|---|---|
| DNS domain utama | Enam probe mengembalikan NOERROR dan A yang sama. Query AAAA NOERROR tanpa jawaban. |
| HTTPS ke Vercel | Landing 200, sertifikat dipercaya, di keempat jaringan Kamboja dan dua kontrol. |
| HTTP ke HTTPS | 308 ke domain undangan yang sama pada seluruh enam probe. |
| API melalui domain utama | Cogetel/AS23673 mendapat 403 HTML Cloudflare pada `/api/content`, direproduksi dua kali. Jaringan lain mendapat 200 JSON. |
| Media backend | Satu foto publik `/media/<uuid>.jpg` mendapat 403 HTML Cloudflare dari Cogetel; lima probe lain mendapat 200 image/jpeg. |
| Media statis | Aset WebP Vercel mendapat 200 di empat jaringan Kamboja dan Singapura. Satu probe Indonesia mengalami timeout resolver, sehingga hasil itu tidak dinyatakan PASS. |
| Edge Vercel | Log `/api/content`: dua respons 403 melalui `hkg1`, country KH, **wafAction=allow**; tiga respons 200 KH melalui `sin1`, juga allow. |
| Upstream langsung | Cogetel mendapat 200 JSON saat GET publik ke upstream `/api/content`, Ray berakhiran SIN; jalur domain utama tetap 403 berakhiran HKG. |
| Supabase | Agregat log 24 jam untuk `wedding-db` yang ditemukan: 866 respons 200. Ini tidak membuktikan setiap request gagal mencapai DB; tidak ada korelasi request end-to-end yang tersedia. |

Ray ID dan waktu measurement (UTC; WIB = UTC+7):

| Measurement | Waktu mulai | Hasil |
|---|---|---|
| [API awal](https://api.globalping.io/v1/measurements/2yJofMKjD3xWJYcKp00021PX9) | 2026-10-30 08:35:03Z | 403, Ray `a529159ef897846f-HKG`, Cogetel |
| [API pemeriksaan ulang](https://api.globalping.io/v1/measurements/2dmNejiNqPdqIepif00021PXA) | 2026-10-30 08:36:11Z | 403, Ray `a52917473c5fa0b0-HKG`, Cogetel |
| [Upstream langsung](https://api.globalping.io/v1/measurements/2zCArkZQcOjZ3YwE800021PXA) | 2026-10-30 08:36:06Z | 200, Ray `a5291725d9c644bf-SIN`, Cogetel |
| [Foto galeri publik](https://api.globalping.io/v1/measurements/2Ln5mCA3A1Hs6zaVf00021PXG) | Lihat timestamp evidence | 403, Ray `a52920290b2e0962-HKG`, Cogetel |

**Tahap gagal yang terkonfirmasi:** request sudah mencapai Vercel, firewall Vercel mengizinkan, lalu rute yang masih memakai external rewrite mengembalikan halaman blok Cloudflare. DNS, TLS, dan landing bukan titik gagal pada probe tersebut. Foto statis juga dapat diambil saat API/media backend gagal.

**Inferensi yang didukung pola:** jalur Vercel Hong Kong → upstream Cloudflare memicu penolakan yang tidak terjadi pada jalur Singapura. Rule WAF, klasifikasi bot, atau reputasi IP/ASN upstream yang tepat belum diketahui. Jangan menyimpulkan geoblock seluruh negara atau menyamakan kegagalan ini dengan hasil token tamu tertentu.

Akun Cloudflare terhubung tidak mempunyai zona domain undangan maupun upstream operator. Security event untuk Ray di atas belum dapat dibaca. Tidak ada perubahan aturan WAF, allowlist negara, DNS, sertifikat, atau deployment protection.

IPv6: domain belum menerbitkan AAAA pada probe yang diuji; tes HTTPS IPv6 Singapura/Indonesia gagal ENODATA sebelum TLS. Tidak ada probe Kamboja berkemampuan IPv6 yang terpilih. Ini batas ketersediaan IPv6, bukan bukti penyebab insiden Cogetel IPv4 yang sudah tereproduksi.

## B. Perubahan infrastruktur dan kode

Pekerjaan tetap pada PR #3 dan branch `codex/migrate-vercel-supabase`; tidak membuat proyek atau website baru.

- `scripts/regional-access.mjs`: diagnostik GET/DNS publik dengan target/rute tetap, tanpa parameter token atau cookie; output hanya metadata jaringan/HTTP/TLS, bukan body atau cookie. Legacy hostname dipakai hanya sebagai target diagnostik operator, bukan runtime aplikasi.
- `tests/regional-access.test.mjs`: menolak rute tamu, query, header credential dan host sembarang; memastikan evidence menghapus body, cookie dan alamat probe.
- `tests/browser/journeys.spec.mjs`: fail pada console error/uncaught exception; memeriksa URL Maps, parameter Google Calendar, download ICS dan tiga alarm.
- `tests/browser/server.mjs`: fixture kini melayani M4A sebagai audio/mp4. File musik memang tersedia di build; 404 sebelumnya berasal dari fixture yang tidak mengenali ekstensi itu.
- `public/favicon.svg`, dua halaman HTML admin dan output build privat: ikon admin yang sebelumnya memicu request `/favicon.ico` 404 telah diperbaiki tanpa mengubah desain.
- Vercel: **hanya** `SUPABASE_URL` yang terverifikasi dikonfigurasi sebagai plain server environment untuk target Preview, khusus branch migrasi. Production environment tidak diubah.
- Evidence sanitasi: `docs/evidence/cambodia-2026-10-30.json`. Tidak berisi IP tamu/probe, session cookie, token tamu, atau raw body.

Adapter Vercel, internal rewrites, SQL allowlist dan Supabase Storage dari commit `7254196` tetap dipakai. Tidak ada fallback runtime ke origin lama. Produksi masih versi sebelumnya karena gerbang release belum lengkap.

## C. Verifikasi Preview dan browser

### Otomatis dan browser terisolasi

| Persyaratan | Hasil | Batas bukti |
|---|---|---|
| Build dan 87 tes Node | PASS | Fixture/integrasi terisolasi, bukan layanan hosted |
| Enam perjalanan Chrome desktop/mobile emulation | PASS | Chrome terpasang; viewport mobile/touch bukan HP fisik |
| Token sintetis → cookie, nama, event sesuai | PASS | Hanya fixture Nina & Owen lokal |
| RSVP hadir/ubah/tidak hadir, idempotensi dan persist | PASS | Database fixture; tidak ada RSVP tamu asli dikirim |
| Gallery/lightbox dan guestbook privat | PASS | Fixture lokal |
| Bahasa Indonesia/Inggris | PASS | Fixture lokal; tidak membuktikan browser Kamboja |
| Maps | PASS untuk URL HTTPS dan host yang sesuai | Tidak mengklaim navigasi aplikasi Google Maps di HP fisik |
| Kalender | PASS URL Google Calendar dan download ICS berisi H-7/H-1/1 jam | Penyimpanan ke akun Google dan penerapan default reminder akun NOT VERIFIED |
| Login/logout dan navigasi Wedding Desk | PASS | Kode admin fixture lokal |
| CRUD/bulk/meja/dashboard/CMS/gift privat/large upload | PASS tes terisolasi | Hosted NOT VERIFIED |
| Konsol browser dan uncaught exception | PASS | Enam perjalanan, setelah perbaikan fixture audio dan favicon admin |
| Dependency runtime | PASS | Audit runtime 0 kerentanan |

### Hosted Preview

Preview tetap memakai deployment protection. Landing/locale/login, penolakan admin anonim, shell privat, redirect dan no-store diperiksa lewat CLI terautentikasi, tanpa membuka slug tamu sebenarnya. Detail hasil baru dicatat pada bukti deployment PR.

Backend Preview belum dapat menjalankan operasi data/media: masih memerlukan `WEDDING_DB_TOKEN`, `SUPABASE_STORAGE_KEY`, `ADMIN_EMAIL`, `ADMIN_ACCESS_CODE`, `ADMIN_SESSION_SECRET`, dan `OPENAI_API_KEY`. URL Supabase saja tidak membuat backend siap. Respons 503 pada API/Storage adalah **FAIL readiness**, bukan PASS acceptance fitur. Login berhasil, CRUD hosted, upload/delete Storage, private proof hosted, dan alur bahasa OpenAI asli: **NOT VERIFIED**.

## D. Integritas data dan media

| Entitas | Snapshot sebelum migrasi | Audit saat pekerjaan Kamboja |
|---|---:|---:|
| Undangan | 150 | 150 |
| RSVP | 37 | 37 |
| Hadiah | 5 | 5 |
| Pesan | 10 | 10 |
| Settings | 2 | 2 |
| Referensi media unik database | 21 | 21, settings tidak berubah |
| Bucket Supabase | 0 saat audit sebelumnya | 0 |
| Objek R2 total | Tidak diketahui | Tidak diketahui |
| Objek terverifikasi di Supabase | 0 | 0 |

Checksum seluruh record RSVP, hadiah, pesan dan settings tetap sama. Perbandingan hash per kolom undangan mempertahankan ID, slug, nama, access token, aktif dan assignment event. **Ada drift pada satu alokasi kursi serta `updated_at` saat produksi tetap aktif: total kursi 296 → 297.** Pekerjaan ini tidak melakukan mutasi record undangan; perubahan tidak dibatalkan atau ditimpa. Snapshot baru wajib sebelum cutover, bukan memakai baseline lama seolah produksi beku.

Token asli tidak diminta/dikembalikan oleh query audit baru: pembandingan hanya menggunakan digest di sisi database dan backup privat yang sudah ada. Tidak ada token tamu dipakai dalam HTTP/browser/probe. Invitation terdampak hanya dikonfirmasi `exists + active` melalui SELECT boolean.

Backup privat sebelumnya kembali lulus pemeriksaan checksum 15 tabel dan restore aplikasi 14 tabel/754 baris ke database in-memory. Ini bukan klaim restore PostgreSQL hosted.

Akses R2 asli masih ditolak: akun yang tersedia mengembalikan HTTP 403/10042 “Please enable R2 through the Cloudflare Dashboard”. Bucket operator Sites belum dapat diidentifikasi/list melalui akun tersebut. Mengaktifkan bucket baru di akun ini tidak memberikan data lama. Tidak ada objek sumber dihapus atau diubah.

Seluruh **21 foto publik** yang direferensikan database sudah disalin sebagai snapshot pemulihan privat melalui HTTP publik, total **86.241.571 byte**, terpisah dari manifest release. SHA-256 salinan disk cocok dengan pembacaan publik kedua; MIME juga sama. Manifest berada pada `.local/migration/public-reference-snapshot.json`, file dan objek tidak di-commit. Snapshot referensi **bukan inventory seluruh R2**, tidak mencakup objek yatim/privat yang belum diketahui, dan bukan transfer Supabase. Manifest release penuh tetap wajib.

Advisor Supabase menampilkan RLS aktif tanpa policy pada 14 tabel, serta dua warning EXECUTE pada fungsi `public.rls_auto_enable()` yang bertipe `event_trigger`. Skema/policy/grant tersebut tidak diubah. Warning tidak dinyatakan selesai; tidak ada pemanggilan RPC percobaan atau perubahan privilege produksi dalam penanganan ini. [Panduan advisor](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

## E. Akses internasional

PASS di tabel ini hanya untuk cakupan rute publik yang disebutkan, bukan seluruh perjalanan undangan personal.

| Jaringan/region | Hasil | Bukti dan cakupan |
|---|---|---|
| Kamboja 1 — Cogetel, AS23673, Phnom Penh | **FAIL** | Landing/TLS/DNS 200/valid; dua API 403 dan satu media backend 403; aset statis 200; edge hkg1, WAF Vercel allow |
| Kamboja 2 — Smart Axiata, AS45498, Phnom Penh | **PASS** rute publik | Landing, locale, content, galeri publik dan aset statis 200; TLS valid. Probe eyeball, bukan bukti perangkat/seluler |
| Kamboja 3 — CAMGSM, AS17976, Phnom Penh | **PASS** rute publik | Cakupan sama; probe eyeball, bukan handset |
| Kamboja 4 — LIGHT NODE, AS154177, Phnom Penh | **PASS** rute publik | Cakupan sama; **datacenter**, bukan jaringan seluler |
| Singapura — LeaseWeb, AS59253 | **PASS** IPv4 publik | Landing/API/media 200, TLS valid; datacenter. IPv6 ENODATA |
| Indonesia — beberapa ASN eyeball | **NOT VERIFIED** secara keseluruhan | Landing/API/foto backend 200 pada probe terpilih; satu probe DNS timeout untuk aset statis; IPv6 ENODATA |
| Android/mobile browser fisik dan in-app browser | **NOT VERIFIED** | Enam tes mencakup mobile emulation; tidak ada HP/Instagram/WhatsApp nyata diuji |
| Desktop browser | **PASS** fixture lokal | Chrome nyata pada komputer pengujian, bukan browser remote Kamboja; hosted authenticated flow NOT VERIFIED |
| Undangan personal dari Kamboja | **NOT VERIFIED** | Token tamu asli tidak digunakan; hosted fixture belum dapat dibuat dengan backend Preview belum terkonfigurasi |

Metode dan provenance: [Globalping API](https://globalping.io/docs/api.globalping.io), [skema resmi](https://github.com/jsdelivr/globalping/blob/master/public/v1/components/schemas.yaml). Jangan menyamakan tag eyeball-network, negara ASN, data center, mobile viewport, dan koneksi ponsel fisik.

## F. Deployment, aksi pemilik dan blocker

- Branch yang sama: `codex/migrate-vercel-supabase`.
- [Draft PR #3](https://github.com/slaks37/stefen-jessica-wedding/pull/3); belum merge.
- Implementasi awal `7254196`; dokumentasi gerbang sebelumnya `d911329`. Commit diagnosis ini menambahkan evidence, tes dan perbaikan resource di atas.
- [Preview branch](https://stefen-jessica-wedding-git-codex-migra-b0ea20-slaks37s-projects.vercel.app), dilindungi Vercel Authentication.
- Produksi tetap deployment `dpl_53hrbJUg2PbvQ9iu9jWwV9pGVqBZ`, commit `675ad9d3296172e382841f7e883ef6b0c896d3df`; tidak dipromosikan ke migrasi.
- Build, 87 tes Node, 6 browser journeys dan audit runtime diulang lokal. Status CI commit terbaru diperiksa pada PR, bukan diasumsikan dari CI sebelumnya.

**Aksi pemilik yang tepat:**

1. Pada [environment Vercel proyek yang sama](https://vercel.com/slaks37s-projects/stefen-jessica-wedding/settings/environment-variables), isi enam secret backend di bagian C untuk Preview branch migrasi melalui pengelola secret privat. Gunakan nilai lama untuk transport DB dan sesi agar identitas tetap berlanjut. Jangan kirim nilainya ke chat/Git/log. `SUPABASE_URL` sudah terpasang khusus Preview branch.
2. Dapatkan akses **ListBucket/GetObject** bucket R2 asli dari operator backend Sites: account ID, nama bucket, access key dan secret key melalui jalur privat. Alternatifnya perlu export lengkap dengan inventory sumber, ukuran/MIME/checksum, termasuk objek privat dan objek yang tidak direferensikan database. Public reference snapshot tidak menggantikan itu.
3. Untuk mitigasi operator selama gerbang migrasi belum lengkap, gunakan tiga Ray ID dan timestamp di atas untuk membaca security event upstream dan mengidentifikasi false positive pada jalur Hong Kong. Tidak ada pesan dikirim ke operator atau tamu oleh agen.

Setelah akses tersedia: redeploy Preview dengan env lengkap → validasi DB/sesi → inventory/copy semua media ke bucket private dan verifikasi checksum → acceptance hosted fixture → probe regional hosted → backup/baseline baru → rollback review → merge/cutover proyek/domain yang sama → smoke dan integritas produksi. Tidak ada izin tersirat untuk melewati gerbang ini karena deployment berstatus READY.

## G. Status akhir

**BLOCKED**

Kegagalan nyata telah direproduksi dan dipersempit ke external rewrite yang menerima blok Cloudflare melalui Hong Kong; isu bukan sekadar hipotesis geoblocking. Kode migrasi menghapus jalur tersebut, tetapi enam secret, inventory/transfer R2 penuh, dan acceptance hosted belum tersedia. Produksi tetap memakai backend lama. Tidak ada tamu dihubungi, pesan/undangan dikirim, RSVP asli dikirim, token tamu diputar, atau data tamu dikembalikan ke baseline lama.
