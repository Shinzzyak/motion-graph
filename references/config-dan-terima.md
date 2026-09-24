# Config proyek + terima jadi

Dua alat dari dua sumber berbeda, disatukan ke alur skill ini:

- **Config** — dari `codewithwan/motionforge`. Satu berkas JSON jadi sumber
  kebenaran style brief + rundown + manifest aset, dan disalin ke dalam
  `index.html` saat build.
- **Terima jadi** — dari `blixvip/MotionClone`. Alur revisi tertulis + kewajiban
  menyatakan batas apa adanya.

Keduanya **opsional**. Proyek 3 adegan sekali jalan tidak butuh config. Proyek
>3 adegan, atau yang akan direvisi, atau yang dibandingkan dengan proyek lain —
butuh. Kalau tidak dipakai, jangan buat lapisan setengah jalan.

---

## 1. `project.config.json`

Nama berkasnya `project.config.json` di folder proyek. Empat blok:

```jsonc
{
  "meta":   { },   // fakta format
  "brief":  { },   // style brief (Hukum #3) sebagai FIELD
  "assets": [ ],   // manifest aset yang bisa ditukar
  "scenes": [ ]    // rundown berurut
}
```

### `meta`

```jsonc
"meta": {
  "title":    "Continuum — Gembok & Kunci",
  "type":     "opener",   // opener | bumper | intro | typography | explainer | title
  "ratio":    "16:9",     // 16:9 | 9:16 | 1:1  -> menentukan konstanta panggung
  "duration": 34,         // detik, total timeline
  "fps":      30,         // fps render untuk export
  "audio":    "none",     // none | vo | music
  "loop":     true
}
```

`ratio` menggerakkan panggung: `16:9` = 1920×1080, `9:16` = 1080×1920,
`1:1` = 1080×1080. Semua resep di `techniques.md` tetap jalan; hanya konstanta
panggungnya yang berubah.

### `brief` — style brief sebagai field, bukan paragraf

Ini pengganti paragraf style brief. Bentuk field memaksa tiap pilihan DIISI,
bukan dinarasikan, dan tiap nilai menunjuk ke satu menu di `techniques.md` atau
`opener-konsep.md`.

```jsonc
"brief": {
  "theme":       "router AI yang mengubah perilaku di dalam pipa data",
  "adjectives":  ["berat", "presisi", "terkunci"],
  "concept":     "7-metafora-benda",      // id konsep dari opener-konsep.md
  "structureFingerprint": "metafora-benda · 5 adegan · gembok / silinder kunci / manifold / kisi cincin / corong · gembok turun dari atas · monogram terpatri",
  "palette": {
    "primary": "#F5F2EB", "base": "#141210", "accent": "#FF3B00",
    "source":  "primary: pualam bodi logam gembok; base: basalt hangus ruang mesin; accent: merah sinyal bypass"
  },
  "fonts":  { "display": "Cabinet Grotesk", "support": "Commit Mono" },
  "backgroundSurface": "basalt hangus + bercak pelat + grain",   // menu §7d
  "backgroundMotion":  "diam-bertekstur",                        // menu §7c
  "objectStyle":       "logam-monolitik",                        // menu §7e
  "emphasis":          "pill",   // none | pill | under | marker | box | color | strike
  "transitions":       ["push-through 3D", "kartu berputar dari kedalaman"],
  "signatureMotion":   "mechanical detent: putaran 90 derajat + hentakan pada setiap perubahan fungsi",
  "specialMoment":     "bodi gembok membelah presisi lalu mekar jadi manifold pneumatik"
}
```

Aturan yang ditegakkan:

- **Setiap warna menyebut sumbernya** di `palette.source`. Warna yang bukan dari
  brand ditulis `derived: alasan`. Palet placeholder abu (`#8A8F98`/`#111318`)
  berarti gaya belum diturunkan — sinyal yang sama dengan starter abu.
- `concept` wajib salah satu id dari `references/opener-konsep.md`.
- `structureFingerprint` satu baris: `konsep · jumlah adegan · objek utama tiap
  adegan · pembuka · penutup`. Ini yang dibandingkan antar proyek untuk
  membuktikan kebaruan KERANGKA, bukan cuma kulit.
- `backgroundSurface`, `backgroundMotion`, `objectStyle`, `emphasis`, dan tiap
  `transitions[]` menunjuk ke menu; jangan tulis bebas.
- `emphasis: "none"` sah. Sorotan kata tidak otomatis di tiap kalimat.

### `assets` — manifest yang bisa ditukar

```jsonc
"assets": [
  {
    "id":          "gembok",
    "type":        "image",        // image | clip | audio
    "file":        "assets/gembok.png",
    "transparent": true,           // PNG potongan; false hanya untuk latar penuh
    "source":      "gpt",          // gpt | user | stock | generated
    "prompt":      "foto studio gembok baja ... latar polos",
    "notes":       "dipakai sebagai subjek berulang di semua adegan"
  }
]
```

- `id` stabil; adegan mengikat lewat `id`, **tidak pernah lewat nama berkas** —
  tukar berkas tidak menyentuh satu baris pun adegan.
- `prompt` disimpan supaya prompt GPT-nya bisa diulang dan diedit.
- **Satu subjek berulang** dipakai di sebagian besar adegan (benang merah visual),
  plus 2–4 properti yang benar-benar dibutuhkan adegan — bukan satu gambar baru
  per adegan.
- Latar biasanya TIDAK dari gambar: latar dari permukaan CSS/WebGL.

### `scenes` — rundown

```jsonc
"scenes": [
  {
    "id":        "s1",
    "start":     0,                 // detik di timeline induk
    "dur":       5,
    "style":     "mewah-gelap",     // arah gaya dari SKILL.md
    "text":      { "line": "terkunci", "tier2": "" },   // tier2 opsional
    "textDoor":  "inUp",            // inUp|inDown|inLeft|inRight|inDepth|inMask|inWords
    "assets":    ["gembok"],
    "camera":    "into",            // into | settle | look | home | breath
    "bgMotion":  "diam-bertekstur", // boleh menimpa brief.backgroundMotion
    "transitionOut": "push-through"
  }
]
```

Batasan yang ditegakkan (sama dengan larangan struktural di `SKILL.md`):

- `text.line` + `text.tier2` saja. **Field teks ketiga ditolak.**
- Dua adegan berturut-turut harus berbeda di `textDoor` DAN di ukuran/posisi visual.
- Tiap adegan punya `bgMotion` — tidak ada latar statis.
- Adegan dengan `style` sama tetap berganti karena `camera` bergerak, bukan
  karena section di-fade.

### Cara config sampai ke deliverable

`index.html` harus bisa dibuka lewat `file://`, dan di sana `fetch('...json')`
GAGAL. Jadi saat build config **disalin ke dalam**:

```html
<script>
window.CONFIG = { /* isi project.config.json, tempel di sini */ };
</script>
```

`project.config.json` tetap sumber kebenaran yang bisa diedit. Salinannya ada di
`index.html`. Saat satu nilai berubah, ubah dua-duanya — atau hasilkan ulang blok
inline-nya dari JSON. Renderer membaca `window.CONFIG` saja.

Config minimal yang sah:

```json
{
  "meta": { "title": "Untitled", "type": "opener", "ratio": "16:9", "duration": 8, "fps": 30, "audio": "none" },
  "brief": { "theme": "", "adjectives": ["","",""], "concept": "", "palette": { "primary": "#8A8F98", "base": "#111318", "accent": "#C4C8CF", "source": "placeholder" }, "fonts": { "display": "", "support": "" }, "backgroundSurface": "", "backgroundMotion": "", "objectStyle": "", "emphasis": "none", "transitions": [], "signatureMotion": "", "specialMoment": "" },
  "assets": [],
  "scenes": []
}
```

---

## 2. Terima jadi

Dua bagian: alur revisi tertulis, dan batas yang wajib dinyatakan.

### 2a. Brief revisi untuk agent berikutnya

Kalau proyek akan diserahkan ke agent/editor lain (atau ke diri sendiri minggu
depan), sertakan brief revisi berbentuk perintah, bukan deskripsi:

```text
Baca README + package.json proyek ini.
Ganti headline jadi [nama produk], subjudul jadi [manfaat terverifikasi].
Pakai warna brand [hex]. PERTAHANKAN timing dan durasi tiap adegan.
Preview di ukuran tonton sesungguhnya. Periksa teks terpotong dan aset hilang.
Render hasilnya, lalu laporkan perbedaan yang belum selesai.
```

Yang membuat brief ini bekerja: ia menyebut apa yang **tidak boleh berubah**
(timing, durasi) sejelas apa yang harus berubah, dan menutup dengan kewajiban
melaporkan sisa perbedaan — bukan klaim selesai.

### 2b. Batas yang wajib dinyatakan apa adanya

Tulis di pesan penutup, bukan disembunyikan:

- **Yang tidak diverifikasi.** Timing VO, audio, tool-calling, atau apa pun yang
  butuh perangkat/akun yang tidak ada — sebut bahwa itu belum diuji.
- **Yang aproksimatif.** Kalau ada bagian yang meniru referensi, nyatakan bahwa
  kemiripannya perkiraan dan sebutkan bagian mana yang paling melenceng.
- **Batas input.** Durasi maksimum, ukuran berkas maksimum, apa yang TIDAK ikut
  ke dalam keluaran (mis. video sumber tidak disertakan di proyek ekspor).
- **Dua keluaran berbeda.** Video hasil dan video perbandingan adalah dua berkas
  berbeda; jangan biarkan user mengira satu mewakili yang lain.
- **Biaya.** Kalau ada langkah yang memakai kuota/biaya akun user, sebut sebelum
  dijalankan, bukan sesudah.

Kalau sesuatu gagal, tulis gagal. Jangan substitusi hasil lain diam-diam.

### 2c. Perbandingan referensi

Kalau user menyodorkan video referensi:

1. **Ambil RITMENYA, bukan kulitnya** (Hukum #3): durasi per shot, urutan, jenis
   transisi, hierarki atensi, energi. BUKAN palet, font, tata letak, kalimat.
2. **Nyatakan itu ke user dalam satu kalimat** — "saya ambil ritmenya; warnanya
   lahir dari brand Anda".
3. **Potret beberapa frame referensi** di detik kunci, dan bandingkan dengan
   frame hasil di detik yang sama. Perbedaan yang kelihatan ditulis, bukan
   diklaim cocok.
4. Kalau tujuannya memang rekonstruksi persis, katakan bahwa itu **aproksimatif**
   dan tunjukkan perbandingan sebelum user memutuskan.

---

## Aturan ringkas

1. **Config dipakai bila proyek >3 adegan, akan direvisi, atau dibandingkan.**
   Kalau tidak, jangan bikin lapisan setengah jalan.
2. **Brief sebagai FIELD**, tiap warna menyebut sumbernya, tiap pilihan menunjuk
   ke satu menu.
3. **`structureFingerprint` ditulis sebelum kode** dan dibandingkan dengan
   proyek sebelumnya.
4. **Config disalin ke `index.html`** — `fetch` gagal di `file://`.
5. **`id` aset stabil**; adegan mengikat lewat `id`, bukan nama berkas.
6. **Terima jadi menyebut batas apa adanya**, termasuk yang belum diverifikasi.
7. **Ambil alat dan prinsip, jangan salin isi repo.**
