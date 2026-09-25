/* =========================================================
   VERIFIKASI TABRAKAN TEKS-vs-GAMBAR.

   Kenapa alat ini ada, terpisah dari `tepi.mjs` dan `perdetik.mjs`:

   - `perdetik.mjs` membandingkan teks dengan TEKS. Ia buta pada gambar.
   - `tepi.mjs` membandingkan elemen dengan TEPI panggung. Ia juga buta.
   - `piksel.mjs` menghitung tinta di PITA TEPI saja, bukan di dalam frame.

   Terukur 2026-09-25 pada explainer sketsa vintage: header
   "CONTINUUM AGENT ROUTER v1.14" diletakkan di `top:225px` sementara lingkaran
   jam menempati `top:114px..786px` — teksnya duduk DI ATAS busur lingkaran, dan
   label italic kecil di tengah menabrak busur bawah. Ketiga alat yang sudah ada
   melaporkan "bersih", karena tidak satu pun membandingkan teks dengan gambar.

   CARA KERJA — mengukur PIKSEL, bukan kotak:
   untuk setiap elemen teks yang terlihat, ambil kotaknya, lalu hitung piksel
   GELAP di dalam kotak itu yang berada DI LUAR glyph teks itu sendiri.
   Caranya: potret frame dengan teks terlihat, lalu potret frame dengan teks
   disembunyikan (`visibility:hidden`), dan bandingkan. Piksel yang gelap di
   frame penuh TAPI juga gelap di frame tanpa-teks = tinta GAMBAR yang berada di
   bawah teks. Itu tabrakan.

   Pakai (dari folder proyek; file:// tanpa server):
     node <path>/tabrakan.mjs . --step 1
     node <path>/tabrakan.mjs . --step 0.5 --min 60
     node <path>/tabrakan.mjs . --json tabrakan.json

   Opsi:
     --step N     jarak pembacaan detik (default 1)
     --min N      piksel gambar minimum di bawah teks untuk dianggap tabrakan (default 60)
     --thresh N   ambang gelap 0-255 (default 110)
     --json FILE  tulis hasil mentah

   Prasyarat: Node + puppeteer. Halaman harus mengekspos
   `window.OPENER = { DURATION, seek(t), ready }`.
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
const STEP = Number(arg('--step', 1));
const MINPIX = Number(arg('--min', 60));
const THRESH = Number(arg('--thresh', 110));
const JSONOUT = arg('--json', '');

const { writeFile } = await import('node:fs/promises');
const path = await import('node:path');
const { pathToFileURL } = await import('node:url');

const URL_ = process.env.URL || pathToFileURL(process.cwd()).href + '/index.html?clean=1';
const puppeteer = await loadPuppeteer();
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars',
         '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1920, height: 1080 },
});
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 200)));

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
console.log(`durasi: ${DUR}s   step=${STEP}s   min=${MINPIX}px   ambang gelap<${THRESH}`);
console.log('');

const SEL = '.line,.name,.hand,.ghost,.headline,.label,.big,.txt';

/* Ukur di dalam halaman: satu frame, satu daftar elemen teks + kotaknya.
   Lalu frame kedua dengan teks disembunyikan. Piksel gelap yang ADA di frame 1
   dan JUGA ada di frame 2 (di posisi yang sama) = gambar di bawah teks. */
const times = [];
for (let t = 0; t <= DUR; t += STEP) times.push(Number(t.toFixed(2)));

const hits = new Map();
for (const t of times) {
  await page.evaluate(async (tt) => {
    if (window.OPENER.seekFrame) await window.OPENER.seekFrame(tt);
    else { window.OPENER.seek(tt); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); window.OPENER.seek(tt); }
  }, t);

  const withText = await page.screenshot({ encoding: 'base64' });

  const boxes = await page.evaluate((sel) => {
    const st = document.querySelector('#stage') || document.body;
    const S = st.getBoundingClientRect();
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (parseFloat(cs.opacity) < 0.5) continue;
      const txt = (el.textContent || '').trim();
      if (!txt) continue;
      /* Kotak GLYPH, bukan kotak elemen. `getBoundingClientRect()` pada elemen
         inline melaporkan kotak yang bisa jauh lebih tinggi dari hurufnya
         (line-height, descender ruang kosong) — dan tinta gambar di ruang kosong
         itu lalu dihitung sebagai tabrakan. Positif palsu terukur 2026-09-25:
         satu headline dilaporkan "2425 px tabrakan" padahal matanya bersih.
         `Range.selectNodeContents` memberi kotak yang benar-benar ditempati teks. */
      let b;
      try {
        const rg = document.createRange();
        rg.selectNodeContents(el);
        b = rg.getBoundingClientRect();
        if (b.width < 4 || b.height < 4) b = el.getBoundingClientRect();
      } catch { b = el.getBoundingClientRect(); }
      if (b.width < 4 || b.height < 4) continue;
      const x = Math.round(b.left - S.left), y = Math.round(b.top - S.top);
      if (x + b.width < 0 || y + b.height < 0 || x > S.width || y > S.height) continue;
      out.push({ id: el.id || String(el.className).split(' ')[0], txt: txt.slice(0, 26),
                 x, y, w: Math.round(b.width), h: Math.round(b.height) });
    }
    return out;
  }, SEL);

  if (!boxes.length) continue;

  /* sembunyikan SEMUA teks, potret lagi */
  await page.evaluate((sel) => {
    window.__hidden = [];
    for (const el of document.querySelectorAll(sel)) {
      window.__hidden.push([el, el.style.visibility]);
      el.style.visibility = 'hidden';
    }
  }, SEL);
  const noText = await page.screenshot({ encoding: 'base64' });
  await page.evaluate(() => {
    for (const [el, v] of window.__hidden) el.style.visibility = v;
    window.__hidden = null;
  });

  /* bandingkan piksel di dalam tiap kotak teks */
  const res = await page.evaluate(async ({ a, b, boxes, thresh }) => {
    const load = async (d) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + d; await img.decode();
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      return { w: img.width, h: img.height, px: ctx.getImageData(0, 0, img.width, img.height).data };
    };
    const A = await load(a), B = await load(b);
    const dark = (P, x, y) => {
      const o = (y * P.w + x) * 4;
      return P.px[o] < thresh && P.px[o + 1] < thresh && P.px[o + 2] < thresh;
    };
    const out = [];
    for (const bx of boxes) {
      let under = 0;
      for (let y = Math.max(0, bx.y); y < Math.min(A.h, bx.y + bx.h); y += 2) {
        for (let x = Math.max(0, bx.x); x < Math.min(A.w, bx.x + bx.w); x += 2) {
          if (dark(B, x, y)) under++;   // gelap TANPA teks = gambar
        }
      }
      if (under > 0) out.push({ ...bx, under });
    }
    return out;
  }, { a: withText, b: noText, boxes, thresh: THRESH });

  for (const r of res) {
    const k = `${r.id}|${r.txt}`;
    const s = hits.get(k) || { ...r, max: 0, first: t, last: t, n: 0 };
    s.max = Math.max(s.max, r.under); s.last = t; s.n++;
    hits.set(k, s);
  }
}

console.log('=== GAMBAR DI BAWAH TEKS (tabrakan) ===');
const bad = [...hits.values()].filter((h) => h.max >= MINPIX).sort((a, b) => b.max - a.max);
if (!bad.length) {
  console.log('  (bersih — tidak ada tinta gambar di bawah kotak teks mana pun)');
} else {
  for (const h of bad) {
    console.log(`  ${String(h.max).padStart(6)} px  ${String(h.id).padEnd(10)} "${h.txt}"  (${h.first}s..${h.last}s, ${h.n} pembacaan)`);
  }
  console.log('');
  console.log('  perbaikan: geser teks keluar dari area gambar, ATAU beri pelat latar');
  console.log('             (kertas lebih terang / kotak) supaya teks tidak bertumpuk garis.');
}

if (pageErrors.length) {
  console.log('\n=== ERROR HALAMAN ===');
  for (const e of pageErrors.slice(0, 8)) console.log('  ' + e);
}

if (JSONOUT) {
  await writeFile(JSONOUT, JSON.stringify({ url: URL_, dur: DUR, step: STEP, min: MINPIX, hits: [...hits.values()], pageErrors }, null, 1));
  console.log(`\nraw -> ${JSONOUT}`);
}

await browser.close();
console.log('\nselesai');
process.exit(bad.length ? 1 : 0);
