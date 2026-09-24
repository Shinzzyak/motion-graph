/* =========================================================
   VERIFIKASI PIKSEL: apakah ada TINTA menyentuh tepi frame?

   Kenapa alat ini ada, dan kenapa ia BUKAN duplikat `tepi.mjs`:

   `tepi.mjs` mengukur GEOMETRI DOM — kotak elemen dari
   `getBoundingClientRect()`. Itu berguna, tapi buta pada hal yang hanya
   muncul saat halaman benar-benar DIGAMBAR:

     - filter SVG yang melebar keluar kotak elemen
     - `mix-blend-mode` yang menumpahkan warna
     - `overflow` yang tidak terlihat di DOM
     - bayangan, blur, dan elemen yang "di dalam" menurut DOM tapi
       pikselnya mendarat di luar tepi
     - dan yang paling penting: apa yang benar-benar ada di MP4 hasil render

   Alat ini mengukur PIKSEL dari frame yang benar-benar digambar. Itulah
   pengukuran yang menemukan bug roda gigi SVG pada 2026-09-25 — setelah
   `tepi.mjs` versi lama melaporkan "bersih", dan setelah videonya terkirim.
   Waktu itu pengukurannya gw tulis dadakan di Python; sekarang jadi alat.

   Pakai (dari folder proyek; halaman dibuka lewat file://, tanpa server):
     node <path>/piksel.mjs .                        # langkah 2 dtk
     node <path>/piksel.mjs . --step 1 --band 40
     node <path>/piksel.mjs . --json piksel.json

   Opsi:
     --step N     jarak pembacaan detik (default 2)
     --band N     lebar pita tepi yang diperiksa, px (default 40)
     --thresh N   ambang gelap 0-255; piksel < N dihitung sebagai tinta
                  (default 110 — kertas sepia punya luminance > 180)
     --min N      jumlah piksel tinta minimum untuk dianggap temuan (default 12)
     --vw/--vh N  ukuran viewport (default 1920x1080 — WAJIB seukuran panggung)
     --json FILE  tulis hasil mentah

   Keluaran: per detik, jumlah piksel tinta di empat pita tepi + skala kamera.
   Temuan hanya dilaporkan saat kamera DIAM (z <= 1,05) — shot close-up
   memang memotong tepi, dan tanpa pembedaan itu laporannya penuh positif
   palsu yang membuat alatnya diabaikan.

   Prasyarat: Node + puppeteer. Halaman harus mengekspos
   `window.OPENER = { DURATION, seek(t), ready }` dan punya `#stage`.
   ========================================================= */
async function loadPuppeteer() {
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  try {
    const req = createRequire(pathToFileURL(process.cwd() + '/').href);
    return req('puppeteer');
  } catch {
    const m = await import('puppeteer');
    return m.default || m;
  }
}

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const STEP = Number(arg('--step', 2));
const BAND = Number(arg('--band', 40));
const THRESH = Number(arg('--thresh', 110));
const MINPIX = Number(arg('--min', 12));
const JSONOUT = arg('--json', '');
const CAM_REST = 1.05;   // di atas ini = kamera belum home; keluar tepi itu sah

const { writeFile } = await import('node:fs/promises');
const path = await import('node:path');
const { pathToFileURL } = await import('node:url');

const URL_ = process.env.URL || pathToFileURL(process.cwd()).href + '/index.html?clean=1';
const puppeteer = await loadPuppeteer();
/* Viewport WAJIB 1920x1080. Tanpa ini Puppeteer memakai 800x600, panggung tidak
   mengisi frame, dan area letterbox (`html,body{background:#0a0a0a}`) terbaca
   sebagai "tinta" di keempat tepi — 8000 piksel palsu per sisi. Pelajaran:
   alat pengukur piksel harus tahu di UKURAN apa ia mengukur. */
const VW = Number(arg('--vw', 1920));
const VH = Number(arg('--vh', 1080));
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars',
         '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: VW, height: VH },
});
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text().slice(0, 160)); });

await page.goto(URL_, { waitUntil: 'load', timeout: 120000 });

let ready = false;
try {
  await page.waitForFunction('window.OPENER && window.OPENER.ready === true', { timeout: 90000 });
  ready = true;
} catch { /* timeline tidak terbangun — itu temuan */ }
await page.evaluate(() => document.fonts && document.fonts.ready);

console.log(`URL   : ${URL_}`);
console.log(`ready : ${ready}${ready ? '' : '   <== TIMELINE TIDAK TERBANGUN'}`);
if (!ready) {
  console.log(`error : ${pageErrors.length ? pageErrors[0] : '(tidak ada pesan)'}`);
  await browser.close();
  process.exit(1);
}

const DUR = await page.evaluate(() => window.OPENER.DURATION);
console.log(`durasi: ${DUR}s   step=${STEP}s   pita=${BAND}px   ambang gelap=<${THRESH}   min=${MINPIX}px`);
console.log('');

const times = [];
for (let t = 0; t <= DUR; t += STEP) times.push(Number(t.toFixed(2)));

const rows = [];
for (const t of times) {
  await page.evaluate(async (tt) => {
    if (window.OPENER.seekFrame) await window.OPENER.seekFrame(tt);
    else { window.OPENER.seek(tt); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); window.OPENER.seek(tt); }
  }, t);

  const camZ = await page.evaluate(() => {
    const w = document.querySelector('#world');
    if (!w) return null;
    const m = String(getComputedStyle(w).transform).match(/matrix\(([-\d.]+)/);
    return m ? +Number(m[1]).toFixed(3) : null;
  });

  const b64 = await page.screenshot({ encoding: 'base64' });

  /* Piksel dihitung DI DALAM halaman: gambar skrinsyot dimuat ke <canvas>
     lalu `getImageData`. Tidak perlu pustaka dekode PNG di Node. */
  const counts = await page.evaluate(async ({ data, band, thresh }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + data;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const W = img.width, H = img.height;
    const px = ctx.getImageData(0, 0, W, H).data;
    const dark = (x, y) => {
      const o = (y * W + x) * 4;
      return px[o] < thresh && px[o + 1] < thresh && px[o + 2] < thresh;
    };
    let kiri = 0, kanan = 0, atas = 0, bawah = 0;
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < Math.min(band, W); x += 2) if (dark(x, y)) kiri++;
      for (let x = Math.max(0, W - band); x < W; x += 2) if (dark(x, y)) kanan++;
    }
    for (let x = 0; x < W; x += 2) {
      for (let y = 0; y < Math.min(band, H); y += 2) if (dark(x, y)) atas++;
      for (let y = Math.max(0, H - band); y < H; y += 2) if (dark(x, y)) bawah++;
    }
    return { W, H, kiri, kanan, atas, bawah };
  }, { data: b64, band: BAND, thresh: THRESH });

  rows.push({ t, camZ, ...counts });
}

/* Temuan = tinta di pita tepi SAAT KAMERA DIAM. Saat close-up itu normal. */
const hits = [];
const hitsCloseup = [];
for (const r of rows) {
  const sisi = [];
  if (r.kiri >= MINPIX) sisi.push(`kiri ${r.kiri}`);
  if (r.kanan >= MINPIX) sisi.push(`kanan ${r.kanan}`);
  if (r.atas >= MINPIX) sisi.push(`atas ${r.atas}`);
  if (r.bawah >= MINPIX) sisi.push(`bawah ${r.bawah}`);
  if (!sisi.length) continue;
  const rec = { t: r.t, camZ: r.camZ, sisi: sisi.join(' · '), ...r };
  if (r.camZ !== null && r.camZ > CAM_REST) hitsCloseup.push(rec);
  else hits.push(rec);
}

console.log(`=== TINTA MENYENTUH TEPI SAAT KAMERA DIAM (z <= ${CAM_REST}) — kegagalan ===`);
if (!hits.length) {
  console.log('  (bersih — tidak ada tinta di pita tepi selama kamera tidak close-up)');
} else {
  for (const h of hits) {
    console.log(`  ${String(h.t).padStart(5)}s  z=${String(h.camZ).padStart(5)}  ${h.sisi}`);
  }
  console.log('');
  console.log('  perbaikan: elemen yang keluar panggung saat kamera diam hampir selalu');
  console.log('             pivot transform yang salah. Pada elemen SVG pakai');
  console.log('             svgOrigin (ruang user), BUKAN transformOrigin (relatif bbox).');
}

if (hitsCloseup.length) {
  console.log('');
  console.log('=== TINTA DI TEPI SAAT CLOSE-UP (informasi — ini sah) ===');
  const ringkas = hitsCloseup.map((h) => `${h.t}s(z=${h.camZ})`).join(' ');
  console.log(`  ${hitsCloseup.length} pembacaan: ${ringkas}`);
}

console.log('');
console.log('=== RINGKASAN PIKSEL TEPI (maksimum sepanjang durasi) ===');
const maks = rows.reduce((a, r) => ({
  kiri: Math.max(a.kiri, r.kiri), kanan: Math.max(a.kanan, r.kanan),
  atas: Math.max(a.atas, r.atas), bawah: Math.max(a.bawah, r.bawah),
}), { kiri: 0, kanan: 0, atas: 0, bawah: 0 });
console.log(`  kiri ${maks.kiri}  ·  kanan ${maks.kanan}  ·  atas ${maks.atas}  ·  bawah ${maks.bawah}`);
console.log(`  (pita ${BAND}px, tiap piksel ke-2, ambang gelap < ${THRESH}, temuan bila >= ${MINPIX})`);

if (pageErrors.length) {
  console.log('\n=== ERROR HALAMAN ===');
  for (const e of pageErrors.slice(0, 8)) console.log('  ' + e);
}

if (JSONOUT) {
  await writeFile(JSONOUT, JSON.stringify({ url: URL_, dur: DUR, step: STEP, band: BAND, thresh: THRESH, min: MINPIX, rows, hits, hitsCloseup, pageErrors }, null, 1));
  console.log(`\nraw -> ${JSONOUT}`);
}

await browser.close();
console.log('\nselesai');
process.exit(hits.length ? 1 : 0);
