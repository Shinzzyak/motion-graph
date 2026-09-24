# Verifikasi per detik — kelas bug yang tidak terlihat di frame

Diukur 2026-09-22 pada satu proyek nyata (kode dari `ag/gemini-3.8-flash-high`).
Empat bug ditemukan; **tiga di antaranya mustahil ditemukan dengan melihat gambar.**

`snap.mjs` memotret frame — itu perlu. Tapi ada satu kelas bug yang lolos ke hasil
akhir **tiga kali** dalam satu proyek, dan kelasnya selalu sama:

> **Elemen yang tidak pernah benar-benar dimatikan.**

Baca dokumen ini SEBELUM menyerahkan apa pun yang bergerak, dan jalankan
`scripts/perdetik.mjs` sebagai langkah verifikasi wajib — bukan opsional.

---

## Empat bug, dan kenapa frame tidak bisa membuktikannya

| # | Gejala | Akar | Kenapa frame buta |
|---|---|---|---|
| 1 | `ReferenceError: s5H is not defined` | variabel dideklarasi `s5Headline`, dipakai `s5H` (4×) | Timeline **tidak terbangun sama sekali**. Layar menampilkan keadaan awal, yang terlihat "belum mulai", bukan "rusak". |
| 2 | Divider duduk di `x=0` sejak frame pertama | `tl.fromTo(divider, …)` di detik 26,85 **merender state `from` segera** (immediateRender default `true` untuk `fromTo`) → menimpa `gsap.set(divider,{left:'50%'})` yang ditulis lebih dulu | Di frame mana pun sebelum 26,85, posisinya terlihat masuk akal. Tidak ada frame yang bisa membuktikan ia salah. |
| 3 | Teks adegan 5 nyangkut sampai akhir | adegan dipecah per `.word`; yang dimatikan `.word`, tapi **induk `.headline` tetap `opacity:1`** | Di frame akhir, teks itu memang terlihat — dan terlihat "benar" karena adegan lain juga ada. |
| 4 | Teks adegan 4 nyangkut | keluar hanya lewat `clip-path`, `opacity` tetap 1 | Sama: satu frame tidak bisa membedakan "sedang masuk" dari "sudah seharusnya keluar". |

**Semuanya kelas yang sama: elemen tidak pernah benar-benar dimatikan.** Tiga dari
empat (`#2`, `#3`, `#4`) hanya ketemu kalau ada yang **mengukur opacity dan posisi
per detik**, bukan dengan melihat beberapa frame.

---

## Aturan yang lahir dari empat bug itu

### 1. `fromTo` merender state `from` SEGERA — itu menimpa `gsap.set` sebelumnya

Ini penyebab `#2` dan bug yang paling sulit dilihat.

```js
gsap.set(divider, { left: '50%' });          // ditulis di awal
// ... 26 detik kemudian di timeline:
tl.fromTo(divider, { left: '0%' }, { left: '100%' }, 26.85);
//                            ^^^ immediateRender default TRUE
//                            -> state 'from' dirender SEKARANG, bukan di 26.85
```

Akibatnya `left` menjadi `0%` sejak frame pertama, dan `gsap.set` di atasnya hilang.

**Aturan:** setiap `fromTo`/`from` yang dijadwalkan di detik > 0 dan menyentuh
properti yang sudah di-`set` sebelumnya **WAJIB** `immediateRender: false`.

```js
tl.fromTo(divider, { left: '0%' }, { left: '100%', immediateRender: false }, 26.85);
```

Resep di `techniques.md` §1 sudah memakai `immediateRender:false` — tapi sebagai
kebiasaan di dalam helper, bukan sebagai aturan. **Aturannya di sini.**

### 2. Mematikan anak tidak mematikan induk

Penyebab `#3`. Kalau sebuah blok dipecah per kata (`.word`), yang di-tween adalah
`.word` — tapi induknya (`.headline`, `.hero`, `.b`) tetap `opacity: 1` dan
**bounding box-nya masih terhitung**, jadi ia menghalangi teks lain dan tetap
terbaca di layar.

**Aturan:** matikan di level yang sama dengan yang kamu hidupkan. Kalau masuknya
per-kata, keluarnya juga per-kata **dan** induknya harus ikut di-`autoAlpha:0`.

```js
tl.to(headline.querySelectorAll('.word'), { autoAlpha: 0, stagger: .02 }, out);
tl.to(headline, { autoAlpha: 0 }, out + .2);      // <- induk, jangan lupa
```

### 3. `clip-path` habis BUKAN berarti elemen hilang

Penyebab `#4`. `getBoundingClientRect()` **tetap mengembalikan box** walaupun
`clip-path: inset(0 0 100% 0)` membuatnya tak terlihat. Detector naif akan
melaporkan positif palsu.

**Aturan:** setiap pemeriksa tumpang tindih wajib melewati elemen yang
`getComputedStyle(el).clipPath` mengandung `100%`.

```js
const cp = getComputedStyle(el).clipPath || 'none';
if (/inset\([^)]*100%/.test(cp)) continue;      // ter-clip habis: tidak terlihat
```

### 4. Checker dengan daftar kelas tetap akan buta

`check.mjs` versi pertama mencari `.line,.big,.term,.mnode,…` — kelas dari SATU
proyek lama. Kode dari model memakai `.headline`/`.label`, jadi checker melaporkan
**"0 elemen teks"** padahal teksnya ada di layar.

**Checker yang buta akan SELALU hijau.** Itu lebih buruk daripada tidak punya
checker.

**Aturan:** pakai kelas generik (`h1,h2,h3,.txt,.hl-t,.headline,.label,.line,.big,.unit`)
dan perluas daftarnya setiap kali ada gaya penamaan baru. Jangan pernah mengunci
ke kelas satu proyek.

### 5. Elemen di luar `#dom` tidak akan ditemukan kalau pencarian dibatasi `#dom`

Divider pada proyek itu ada di luar `#dom`. Pencarian yang dibatasi ke `#dom`
tidak menemukannya sama sekali dan laporan berbunyi "TIDAK ADA" — padahal ada.

**Aturan:** cari dari `#stage`, bukan dari `#dom`.

---

## Alat

| Alat | Fungsi | Menemukan bug |
|---|---|---|
| `scripts/snap.mjs` | potret frame di detik kunci → lembar kontak | `#1` (kalau ada PAGEERROR), komposisi |
| `scripts/perdetik.mjs` | tumpang tindih teks + teks nyangkut + skala kamera, per detik | `#3`, `#4` |
| `scripts/lacak.mjs` | satu elemen dilacak properti-per-properti di setiap detik | `#2` |

```bash
# 1. ukur tumpang tindih + teks nyangkut (wajib sebelum serah)
node <skill>/scripts/perdetik.mjs . --step 1

# 2. kalau ada elemen yang geraknya mencurigakan, lacak satu-satu
node <skill>/scripts/lacak.mjs . "#divider" --step 0.5 --box
node <skill>/scripts/lacak.mjs . "#world" --props transform,opacity

# 3. potret frame untuk menilai komposisi (bukan untuk menemukan bug di atas)
node <skill>/scripts/snap.mjs shots 1 3.5 8 12 20
```

### Cara membaca keluaran `perdetik.mjs`

- `N teks` per detik — kalau angkanya **tidak pernah turun** padahal adegannya
  sudah lewat, itu tanda bug kelas `#3`/`#4`.
- Baris `>>` = tumpang tindih nyata (ambang 8×8 px).
- `world=` = skala kamera. Turun terus tanpa pernah kembali ke 1 → kamera tidak
  pernah "home".
- Bagian **TEKS YANG NYANGKUT** di akhir: teks yang terlihat ≥ 4 detik berturut-turut.
  Ambang ini bisa dilanggar secara sengaja (teks yang memang ditahan), tapi
  kalau begitu **umumkan di style brief** — jangan diabaikan.

---

## Yang harus ada di halaman supaya alat ini jalan

Semua starter di skill ini sudah begitu:

```js
window.OPENER = { W, H, DURATION, ready: false, seek(t){} };
window.OPENER.clipsReady  = () => …;   // kalau ada klip video
window.OPENER.seekFrame   = (t) => …;  // kalau ada klip video
```

- `?clean=1` menahan autoplay supaya `seek()` tidak dilawan ticker.
- `--fit` (custom property di `:root`) dipakai untuk menormalkan koordinat ke
  ukuran panggung; kalau tidak ada, dianggap 1.

---

## Batas yang harus dinyatakan

Alat ini mengukur **geometri dan opacity**, bukan makna. Ia tidak bisa menilai:

- apakah geraknya terasa sinematik atau masih seperti slide — itu tugas `snap.mjs`
  + mata, dan `references/anti-ppt.md`;
- apakah teks terbaca di HP — ukuran minimum tetap aturan manual;
- apakah ritmenya pas dengan VO — butuh audio, dan audio belum bisa didengar agent.

Kalau salah satu dari itu belum diperiksa, **tulis belum diperiksa** saat menyerahkan
(`references/config-dan-terima.md` §2b). Alat yang hijau bukan bukti bahwa videonya bagus —
ia hanya bukti bahwa tiga kelas bug tertentu tidak ada.
