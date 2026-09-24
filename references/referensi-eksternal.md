# Referensi eksternal — apa yang layak diambil, apa yang tidak

Tiga sumber dipelajari 2026-09-22. Aturan: ambil PRINSIP dan ALAT, jangan salin
kode atau isi. Yang tidak diambil dicatat supaya tidak dipelajari ulang.

## 1. bangtutorial/bang-motion (upstream skill ini)

`github.com/bangtutorial/bang-motion`. Skill lokal di-upgrade **1.0.0 → 1.19.0**
(2026-09-22). Yang masuk ke versi ini:

- **§3b Ukuran shot — kamera ke elemen.** "Zoom in-out" dirumuskan sebagai
  pergantian ukuran shot (wide ↔ medium ↔ close-up) ke elemen yang bercerita,
  bukan napas kamera beberapa persen yang tak terlihat.
- **Video sebagai layer footage** — helper `clip(el, {at,in,out,rate,hold})`:
  klip mengikuti jam timeline, sinkron saat scrub, bisa dipotong/diperlambat/
  di-mask. `snap.mjs` + `export-frames.mjs` menunggu frame klip siap.
- **`references/opener-konsep.md`** — menu **19 konsep** opener + menu transisi
yang dibawa benda + menu pembuka/penutup. Ini yang mengunci kebaruan
  KERANGKA, bukan hanya kulit. Wajib dibaca sebelum menulis rundown.
- **`references/kartun-panggung.md`** — gaya explainer keenam.
- **`references/ae-bridge-higgsfield.md`** + `scripts/ae/` — membangun explainer
  kartun LANGSUNG di After Effects lewat bridge/MCP.
- **Sorotan kata jadi OPSIONAL**; `none` sah.
- Starter baru: `starter-opener.html`, `starter-explainer-panggung.html`.
  `starter.html` lama dihapus upstream.
- Aset kerja baru: `scripts/kepala-ekspresi.py`, `scripts/ae/bridge/`.

## 2. codewithwan/motionforge

`github.com/codewithwan/motionforge` — **config-first**: satu
`project.config.json` jadi sumber kebenaran (meta + brief + assets + scenes),
HTML diturunkan dari situ.

**Yang layak diambil:**

- **`project.config.json` sebagai artefak perantara.** Empat blok:
  `meta` (title, type, ratio, duration, fps, audio) · `brief` (style brief
  terstruktur) · `assets` (manifest aset yang bisa ditukar) · `scenes`
  (rundown berurut). Nilainya: revisi terjadi di CONFIG, bukan di kode
  timeline — "tukar gambar, urutkan ulang adegan, ubah durasi" tidak menyentuh
  satu baris pun timeline.
- **Brief jadi field, bukan prosa.** `palette.primary/base/accent` + `palette.source`
  (sebut sumber tiap warna), `fonts.display/support`, `backgroundSurface`,
  `backgroundMotion`, `objectStyle`, `emphasis`, `transitions[]`,
  `signatureMotion`, `specialMoment`. Memaksa style brief DIISI, bukan
  dinarasikan — dan tiap nilai menunjuk ke menu di `techniques.md`.
- **`structureFingerprint`** satu baris di brief: `konsep · jumlah adegan ·
  objek utama per adegan · pembuka · penutup`. Itu yang dibandingkan antar
  proyek untuk membuktikan kebaruan kerangka.
- **`ratio` menentukan konstanta panggung**: 16:9 = 1920×1080,
  9:16 = 1080×1920, 1:1 = 1080×1080.
- **Pipeline aset GPT image**: satu blok prompt per aset di `ASSET-PROMPT.md`,
  nama berkas = judul blok (supaya tidak ada yang ter-rename), wajib latar
  transparan, skill memeriksa alpha + ukuran setelah PNG ditaruh.
- **`references/snappy-loop.md`** — gaya loop: semuanya mendarat dengan
  `back.out` + klik 60 ms, aksi dapat tap ripple, pemisah babak = medan warna
  penuh (bukan cross-fade), dua baris headline per babak, penutup membongkar
  diri supaya frame terakhir = frame pertama. 12–18 dtk.

**Yang TIDAK diambil:** struktur berkasnya sendiri. Config-first menambah satu
lapisan yang harus dijaga sinkron; untuk video 30–40 dtk sekali jalan, biayanya
lebih besar dari manfaatnya. Yang diambil hanya IDE-nya (brief sebagai field +
sidik jari struktur), bukan mesinnya.

## 3. blixvip/MotionClone

`github.com/blixvip/MotionClone` — merekonstruksi video referensi jadi proyek
motion editable lewat Codex + ChatGPT. Windows + Python 3.11 + Node 22 +
FFmpeg + Chrome + Codex CLI. Keluaran: proyek **HyperFrames**
(`hyperframes@0.8.33` + `gsap@3.14.2`), bukan satu HTML.

**Yang layak diambil:**

- **Alur revisi tertulis.** Brief revisi untuk agent: baca README + package.json
  ekspor, ganti headline/subjudul, pakai warna brand, PERTAHANKAN timing dan
  durasi adegan, preview di ukuran tonton sesungguhnya, periksa teks terpotong
  dan aset hilang, render, laporkan perbedaan yang belum selesai. Itu kerangka
  review yang bisa dipakai pada proyek kita sendiri.
- **Batas yang dinyatakan terus terang.** Rekonstruksi itu **aproksimatif**: teks
  kecil, font tak dikenal, foto, dan 3D kompleks bisa melenceng jauh. Batas
  input 120 dtk / 250 MB. Ekspor TIDAK memuat video sumber. Perbandingan dan
  video hasil adalah dua keluaran berbeda. Skill kita sudah punya nada yang sama
  ("batas jujur") — ini contoh yang lebih keras.
- **Pelajaran proses:** mereka menulis skrip penerimaan terpisah per aspek
  (`editor_acceptance.py`, `browser_acceptance.py`, `light_ui_acceptance.py`,
  `usability_acceptance.py`, `showcase_acceptance.py`, `pipeline_acceptance.py`).
  Untuk motion, padanannya adalah `check.mjs` (geometri) + `snap.mjs` (mata) —
  dan itu sudah dipakai.

**Yang TIDAK diambil:** HyperFrames/Remotion sebagai runtime. Skill ini
menghasilkan SATU `index.html` yang bisa diklik dua kali; menambah Node project
+ build step melanggar janji itu. Remotion/HyperFrames berguna bila user memang
minta pipeline berbasis React.

## 4. Proyek sendiri — verifikasi per detik (2026-09-24, v1.20.0)

Bukan dari repo luar: lahir dari satu proyek nyata (promo Continuum, 30 dtk) yang
menghasilkan **empat bug, tiga di antaranya mustahil ditemukan dengan melihat
frame**. Yang masuk ke skill:

- **`references/verifikasi-per-detik.md`** — kelas bug "elemen tidak pernah
  benar-benar dimatikan" beserta lima aturan pencegahannya.
- **`scripts/perdetik.mjs`** — tumpang tindih teks lintas adegan, deteksi pola
  penataan (A: adegan di-fade / B: elemen di-tween langsung), kesinambungan layar,
  durasi hidup tiap teks, skala kamera.
- **`scripts/lacak.mjs`** — satu elemen dilacak properti-per-properti tiap detik.

Tiga alat itu sebelumnya hidup hanya di folder PROYEK (`Packs/motion/`), bukan di
skill — jadi agent berikutnya akan menabrak bug yang sama. Sekarang sudah di
`scripts/`, dan langkah 4b di `SKILL.md` mewajibkannya.

**Pelajaran proses:** alat verifikasi yang cuma ada di folder satu proyek sama saja
tidak ada. Kalau sebuah pengukuran menemukan bug, **naikkan alatnya ke skill di
sesi yang sama** — jangan tinggalkan di proyek.

## Aturan yang lahir dari ketiga sumber

1. **Kerangka dulu, kulit kemudian.** Pilih konsep dari menu 19 SEBELUM menulis
   rundown; tulis sidik jari strukturnya. Kulit (palet/font) tidak menyelamatkan
   kerangka yang itu-itu saja.
2. **Style brief sebagai field, bukan paragraf.** Setiap warna menyebut
   sumbernya; setiap pilihan menunjuk ke satu menu.
3. **Ambil alat, bukan mesin.** `check.mjs`/`snap.mjs` sudah setara dengan
   skrip penerimaan mereka, tanpa menambah dependency.
4. **Nyatakan batas.** Kalau ada yang tidak bisa diverifikasi (timing VO,
   audio, tool-calling), tulis apa adanya.
5. **Jangan salin isi repo.** Yang dipakai adalah PRINSIP; palet, font, dan
   kalimat selalu dari brand user.
6. **Alat yang menemukan bug naik ke skill di sesi yang sama.** Alat verifikasi
   yang tertinggal di folder satu proyek akan hilang bersama proyeknya.
