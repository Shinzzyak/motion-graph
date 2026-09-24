/* =========================================================
   VERIFIKASI TEPI: apakah ada teks yang keluar panggung?

   Kenapa alat ini ada, terpisah dari `perdetik.mjs`:
   `perdetik.mjs` mengukur tumpang tindih ANTAR TEKS. Ia tidak pernah
   membandingkan teks dengan TEPI panggung — jadi blok teks yang duduk di
   `top: 1000px` pada panggung 1080px terlihat "bersih" walaupun ekornya
   terpotong tepi bawah selama animasi masuknya.

   Terukur 2026-09-24 pada explainer sketsa vintage 48 dtk: enam blok teks
   diletakkan di top 960-1070. Di posisi istirahat semua masuk. Tapi dengan
   pintu masuk `yPercent: 60` DAN kamera yang masih bergerak turun, blok
   pertama melaporkan `bottom +54px` selama 1,5 detik — persis saat penonton
   membacanya. Tidak ada frame tunggal yang membuat ini jelas; hanya
   pengukuran tiap detik.

   Pakai (dari folder proyek; halaman dibuka lewat file://, tanpa server):
     node <path>/tepi.mjs .
     node <path>/tepi.mjs . --step 0.5 --margin 60
     node <path>/tepi.mjs . --sel "#world .line,#world .name"
     URL="file:///C:/proyek/index.html?clean=1" node <path>/tepi.mjs .

   Opsi:
     --step N     jarak pembacaan detik (default 0.5)
     --margin N   margin aman dari tepi bawah, px (default 60)
     --sel SEL    selector elemen teks (default: kelas umum teks)
     --json FILE  tulis hasil mentah

   Keluaran: satu baris per pelanggaran, dan ringkasan elemen mana yang
   keluar berapa px. Exit 1 kalau ada pelanggaran.

   Prasyarat: Node + puppeteer. Halaman harus mengekspos
   `window.OPENER = { DURATION, seek(t), ready }`.
   ========================================================= */
/* --- RESOLUSI PUPPETEER DARI CWD (lihat catatan di perdetik.mjs) --- */
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
const STEP = Number(arg('--step', 0.5));
const MARGIN = Number(arg('--margin', 60));
const JSONOUT = arg('--json', '');
const SEL = arg('--sel', '#world .line,#world .name,#world .hand,#world .ghost,.line,.name,.hand,.ghost,.headline,.label,.big,.txt');

const { writeFile } = await import('node:fs/promises');
const path = await import('node:path');
const { pathToFileURL } = await import('node:url');

const URL_ = process.env.URL || pathToFileURL(process.cwd()).href + '/index.html?clean=1';
const puppeteer = await loadPuppeteer();
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars',
         '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required'],
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
console.log(`durasi: ${DUR}s   step=${STEP}s   margin=${MARGIN}px`);
console.log('');

const times = [];
for (let t = 0; t <= DUR; t += STEP) times.push(Number(t.toFixed(2)));

const rows = [];
for (const t of times) {
  await page.evaluate(async (tt) => {
    if (window.OPENER.seekFrame) await window.OPENER.seekFrame(tt);
    else { window.OPENER.seek(tt); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); window.OPENER.seek(tt); }
  }, t);

  const r = await page.evaluate(({ sel, margin }) => {
    const stage = document.querySelector('#stage') || document.body;
    const S = stage.getBoundingClientRect();
    const fit = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fit')) || 1;
    const out = [];
    for (const el of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const op = parseFloat(cs.opacity);
      if (op < 0.5) continue;
      const txt = (el.textContent || '').trim();
      if (!txt) continue;
      const cp = cs.clipPath || 'none';
      if (/inset\([^)]*100%/.test(cp)) continue;
      const b = el.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) continue;
      // koordinat relatif panggung, dinormalkan ke ukuran panggung mentah
      const x = (b.left - S.left) / fit, y = (b.top - S.top) / fit;
      const w = b.width / fit, h = b.height / fit;
      const overR = (x + w) - (S.width / fit);
      const overB = (y + h) - (S.height / fit);
      const overL = -x, overT = -y;
      const worst = Math.max(overR, overB, overL, overT);
      // hanya pedulikan kalau benar-benar terlihat sebagian di panggung
      const onStage = (x + w > 4) && (y + h > 4) && (x < S.width / fit - 4) && (y < S.height / fit - 4);
      if (!onStage) continue;
      out.push({
        id: el.id || el.className.split(' ')[0], txt: txt.slice(0, 28),
        x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
        overR: Math.round(overR), overB: Math.round(overB),
        overL: Math.round(overL), overT: Math.round(overT),
        marginB: Math.round((S.height / fit) - (y + h)),
        worst: Math.round(worst),
        safe: worst <= 2 && ((S.height / fit) - (y + h)) >= margin,
      });
    }
    return out;
  }, { sel: SEL, margin: MARGIN });

  rows.push({ t, els: r });
}

/* Pelanggaran = keluar panggung (>2px). Margin tipis dilaporkan terpisah:
   teks yang masih di dalam tapi kurang dari `--margin` dari tepi bawah akan
   terasa mepet setelah di-encode dan ditonton di HP. */
const violations = [];
const tight = [];
for (const row of rows) {
  for (const e of row.els) {
    const out = e.worst > 2;
    const rec = { t: row.t, ...e };
    if (out) violations.push(rec);
    else if (e.marginB < MARGIN) tight.push(rec);
  }
}

const fmt = (e) => {
  const sides = [];
  if (e.overR > 2) sides.push(`kanan +${e.overR}`);
  if (e.overB > 2) sides.push(`bawah +${e.overB}`);
  if (e.overL > 2) sides.push(`kiri +${e.overL}`);
  if (e.overT > 2) sides.push(`atas +${e.overT}`);
  return sides.join(' ');
};

console.log('=== TEKS YANG KELUAR PANGGUNG ===');
if (!violations.length) {
  console.log('  (bersih — semua elemen teks berada di dalam panggung sepanjang durasi)');
} else {
  for (const v of violations) {
    console.log(`  ${String(v.t).padStart(5)}s  ${String(v.id).padEnd(12)} "${v.txt}"  ${fmt(v)}   [x=${v.x} y=${v.y} w=${v.w} h=${v.h}]`);
  }
  console.log('');
  console.log('  perbaikan: geser blok teks naik, atau kurangi simpangan pintu masuk');
  console.log('             (yPercent/y positif masuk dari bawah memakan margin).');
}

if (tight.length) {
  console.log('');
  console.log(`=== MEPET (< ${MARGIN}px dari tepi bawah) — informasi, bukan kegagalan ===`);
  const byId = new Map();
  for (const e of tight) {
    const k = e.id;
    const s = byId.get(k) || { id: k, txt: e.txt, min: 1e9, first: e.t, last: e.t };
    s.min = Math.min(s.min, e.marginB); s.last = e.t;
    byId.set(k, s);
  }
  for (const s of byId.values()) {
    console.log(`  ${String(s.id).padEnd(12)} "${s.txt}"  margin terkecil ${s.min}px  (${s.first}s..${s.last}s)`);
  }
}

if (pageErrors.length) {
  console.log('\n=== ERROR HALAMAN ===');
  for (const e of pageErrors.slice(0, 8)) console.log('  ' + e);
}

if (JSONOUT) {
  await writeFile(JSONOUT, JSON.stringify({ url: URL_, dur: DUR, step: STEP, margin: MARGIN, rows, violations, tight, pageErrors }, null, 1));
  console.log(`\nraw -> ${JSONOUT}`);
}

await browser.close();
console.log('\nselesai');
process.exit(violations.length ? 1 : 0);
