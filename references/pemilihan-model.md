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

## Yang TIDAK boleh disimpulkan

- "Model X lebih pintar." Yang diukur cuma **batas output** pada tugas ini.
- "Model X selalu gagal." Ia berhasil untuk output sampai 6.000 char.
- Angka ini berlaku untuk tugas lain. Ukur ulang kalau brief-nya beda jenis.

## Cara mengukur ulang (kalau brief-nya beda)

1. Kirim brief yang sama ke dua model, `max_tokens` besar (60.000).
2. Cetak `content.length` **dan** `reasoning_content.length`.
3. Kalau `content` = 0 dan `reasoning` besar → model itu tidak dipakai untuk kode.
4. Kalau keduanya 0 → cek jaringan/router, bukan modelnya.
