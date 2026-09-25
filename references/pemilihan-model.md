# Memilih model untuk pekerjaan motion

Diukur 2026-09-22 lewat router sendiri, brief identik, tugas identik. Ini bukan
selera — ini batas yang bisa diperiksa ulang.

## Batas output kode per model

| Model | Output untuk brief kode 6.341 char | Catatan |
|---|---|---|
| `ag/gemini-3.8-flash-high` | **28.312 char kode**, 156 dtk | selesai, dipakai |
| `oc/mimo-v2.6-flash-free` | **0 char**, `reasoning_content` 41–109 ribu char | GAGAL SENYAP |

### Cara mengenali kegagalan senyap ini

`finish_reason` = `stop`, tidak ada error, HTTP 200 — tapi `content` **kosong** dan
`reasoning_content` sangat besar. Model sudah merancang seluruh berkas sampai detail
kode, lalu tidak pernah menuliskannya.

**Selalu periksa `reasoning_content`, jangan cuma `content`.** Kalau `content` kosong
dan `reasoning_content` besar, itu kegagalan deliberasi — bukan kegagalan jaringan.

### Batas terukur untuk `oc/mimo-v2.6-flash-free`

| Tugas | Output | Hasil |
|---|---|---|
| 30 baris + "hanya kode" | 769 char | ✅ |
| 400 baris HTML + "hanya kode" | 22.692 char | ✅ |
| HTML+GSAP 2 adegan | 2.444 char | ✅ |
| + SVG motion blur | 5.231 char | ✅ |
| + rig kamera, 6 adegan | 6.041 char | ✅ |
| 400 baris HTML **tanpa** "hanya kode" | 0 char | ❌ |
| Brief 3.129 char, spesifikasi sangat rinci | 0 char | ❌ |
| Brief 6.341 char | 0 char | ❌ |

**Pola:** berhasil sampai ~6.000 char output. Gagal ketika spesifikasinya sangat
terperinci. Bukan soal panjang brief (3.129 gagal, 6.041 berhasil) — soal seberapa
banyak yang harus ia putuskan sambil menulis.

### Falsifikasi yang sudah dilakukan (jangan diulang)

- ❌ panjang brief — 3.129 char gagal, 6.041 char berhasil
- ❌ `max_tokens` — dinaikkan ke 60.000, tetap gagal
- ❌ perintah "hanya kode" di system prompt — sudah dipasang, tetap gagal
- ❌ kata "persona" di brief — brief sudah menyatakan persona suspended

## Pembagian kerja yang benar

| Tugas | Model yang dipakai | Alasan |
|---|---|---|
| Keputusan brief, pemilihan konsep, rundown | **mana saja** — mimo unggul (8,8 dtk vs 165 dtk) | output pendek, penalaran yang dinilai |
| **Menulis kode besar** | model dengan output panjang terbukti | butuh volume, bukan penalaran |
| Verifikasi & perbaikan | **selalu agent sendiri** | model tidak akan menemukan bug-nya sendiri |

## Diukur ulang 2026-09-25 — brief LEBIH PANJANG mengubah hasilnya

Brief 22.849 char (3,6× lebih panjang dari uji 2026-09-22), system prompt identik,
`max_tokens` 64.000:

| Model | Waktu | Output | `finish` | `reasoning` | Kode bersih | Hasil |
|---|---|---|---|---|---|---|
| `nar/gpt-6-luna` | 186,2 dtk | 20.220 char | **`stop`** | **0** | **20.169** | **dipakai** |
| `ag/gemini-3.8-flash-high` | 47,1 dtk | 14.244 char | `length` | **12.943 (91 %)** | 1.301 | gagal |

**`ag/gemini-3.8-flash-high` yang dulu menghasilkan 28.312 char sekarang GAGAL** — karena
brief-nya 3,6× lebih panjang, dan brief panjang memicu deliberasi. Isi keluarannya:

> *"The user's direct request for code-only output conflicts with the established framing
> contract. The framing contract takes precedence."*

Lalu ia menulis **empat** `<!doctype html>` (tiga contoh palsu di dalam penalarannya),
dan `[thinking: 15.727 tokens hidden by upstream]` di akhir.

**Tiga percobaan, tiga kegagalan pola sama:** brief penuh · brief dipotong 5.303 char +
`Do NOT think, plan, explain` · **dipecah minta CSS saja → BERHASIL (8.361 char CSS utuh)**.

**Aturan:** batas model ini adalah **volume per tarikan**, bukan kemampuan. Kalau gagal
pada tugas besar, **pecah tugasnya** — minta satu bagian (CSS / HTML / JS) per panggilan,
lalu sambung. Percobaan ketiga membuktikan ia bisa menulis bagiannya dengan baik.

**Cara mengenali lebih awal:** `finish_reason: length` dengan `reasoning_chars` besar.
Selalu cetak KEDUANYA.

### Memecah tugas: membantu sampai batas tertentu, lalu berhenti

Tiga bagian, tiga hasil:

| Bagian | Hasil |
|---|---|
| CSS saja | **berhasil** — 8.361 char, semua kelas yang diminta ada |
| Markup HTML saja | **berhasil** — 7.010 char, semua id yang diminta ada |
| Blok `<script>` saja | **gagal** — berhenti setelah kerangka helper, 15.097 token reasoning |

**Kenapa JS gagal sementara CSS dan HTML berhasil:** CSS dan HTML adalah bagian yang
bisa dinilai sendiri-sendiri. JS harus **merujuk DOM yang ditulis bagian lain** — dan di
situ model mulai mengarang.

### Kelas bug yang tidak terlihat di browser: elemen halusinasi

Pada percobaan JS, gemini menulis timeline untuk **8 id yang tidak pernah ada** di brief
maupun di markup yang ia sendiri baru tulis:

```
#problemText  #problemGraphic  #solutionGraphic  #solutionText
#character2   #speechBubble2   #cta              #ctaButton
```

Dan **0 dari 8 id yang benar** (`#clockCase`, `#escapement`, `#springPlate`,
`#fullClock`, `#line1`, `#nameA1`, …). Ia mengarang kerangka explainer generik:
problem → solution → character demo → CTA.

**Kenapa ini berbahaya:** halaman akan `ready`, timeline terbangun, **nol error di
console**. GSAP diam kalau targetnya tidak ada — tidak ada error, tidak ada peringatan.
Yang terlihat cuma **layar kosong**, dan penyebabnya tidak kelihatan dari kode.

**Pemeriksaan yang menangkapnya — murah dan wajib:**

```bash
# id yang DIPAKAI di JS
grep -oE "['\"]#[A-Za-z][A-Za-z0-9_-]*" index.html | sort -u > /tmp/dipakai.txt
# id yang ADA di markup
grep -oE 'id="[A-Za-z][A-Za-z0-9_-]*"' index.html | sed 's/id="/#/;s/"//' | sort -u > /tmp/ada.txt
# yang dipakai tapi tidak ada
comm -23 /tmp/dipakai.txt /tmp/ada.txt
```

Keluaran kosong = bersih. Keluaran berisi = model mengarang, dan halamannya akan
tampak kosong tanpa error apa pun.

## Yang TIDAK boleh disimpulkan

- "Model X lebih pintar." Yang diukur cuma **batas output** pada tugas ini.
- "Model X selalu gagal." Ia berhasil untuk output sampai 6.000 char.
- Angka ini berlaku untuk tugas lain. Ukur ulang kalau brief-nya beda jenis.

## Cara mengukur ulang (kalau brief-nya beda)

1. Kirim brief yang sama ke dua model, `max_tokens` besar (60.000).
2. Cetak `content.length` **dan** `reasoning_content.length`.
3. Kalau `content` = 0 dan `reasoning` besar → model itu tidak dipakai untuk kode.
4. Kalau keduanya 0 → cek jaringan/router, bukan modelnya.
