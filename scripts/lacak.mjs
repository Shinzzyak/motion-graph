/* =========================================================
   LACAK SATU ELEMEN per detik — untuk bug yang TIDAK terlihat di frame.

   Kenapa skrip ini ada, dan kenapa `snap.mjs` tidak cukup:

   Terukur 2026-09-22. Sebuah divider keluar di `x=0` sejak frame PERTAMA,
   padahal kodenya menulis `gsap.set(divider,{left:'50%'})`. Akarnya:
   `tl.fromTo(divider, …)` yang dijadwalkan di detik 26,85 MERENDER state
   `from` SEGERA (`immediateRender` default true untuk `fromTo`), jadi ia
   menimpa `gsap.set` yang sudah ditulis lebih dulu.

   Di frame mana pun sebelum detik 26,85, posisinya terlihat "masuk akal".
   Satu-satunya cara menemukannya: **membaca `css.left` + `transform` di
   setiap detik**, lalu melihat bahwa nilainya tidak pernah sama dengan yang
   kamu set. Melihat gambar tidak akan pernah menunjukkan ini.

   Pakai (dari folder proyek, tanpa server):
     node <path>/lacak.mjs . "#divider"
     node <path>/lacak.mjs . ".pocket" --from 0 --to 30 --step 0.5
     node <path>/lacak.mjs . "#world" --props transform,opacity
     URL="file:///C:/proyek/index.html?clean=1" node <path>/lacak.mjs . "#divider"

   Opsi:
     --from N      detik mulai (default 0)
     --to N        detik akhir (default DURATION)
     --step N      jarak detik (default 0.5 — lebih halus dari perdetik.mjs)
     --props LIST  properti CSS yang dicetak, dipisah koma
                   (default: left,transform,width,height,opacity)
     --box         sekalian cetak getBoundingClientRect relatif #stage
     --stop-on-change   berhenti pada perubahan pertama (mencari momen bug)

   Prasyarat: Node + puppeteer. Halaman harus mengekspos
   `window.OPENER = { DURATION, seek(t), ready }`.
   ========================================================= */
/* --- RESOLUSI PUPPETEER DARI CWD ---
   `import puppeteer from 'puppeteer'` diselesaikan relatif ke BERKAS INI, bukan
   ke folder kerja. Skrip di dalam folder skill karena itu gagal dengan
   ERR_MODULE_NOT_FOUND walaupun user sudah `npm i puppeteer` di folder
   proyeknya — dan pesannya menyesatkan ("paket tidak ada") padahal paketnya ada,
   hanya di tempat lain. Jadi: coba dari CWD dulu, baru jatuh ke import biasa.
   Tanpa ini, setiap pemakaian pertama skrip ini gagal dan terlihat seperti
   skill-nya rusak. */
async function loadPuppeteer() {
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  try {
    const req = createRequire(pathToFileURL(process.cwd() + '/').href);
    const p = req.resolve('puppeteer');
    return (await import(pathToFileURL(p).href)).default;
  } catch { /* lanjut ke fallback */ }
  try {
    return (await import('puppeteer')).default;
  } catch (e) {
    console.error('puppeteer tidak ditemukan. Jalankan sekali di folder proyek:');
    console.error('  npm i puppeteer');
    console.error('lalu jalankan skrip ini DARI folder itu.');
    throw e;
  }
}
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const pos = argv.filter((a) => !a.startsWith('--'));
const DIR = pos[0] || '.';
const SEL = pos[1] || '#world';
const opt = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const FROM = Number(opt('--from', 0));
const STEP = Number(opt('--step', 0.5));
const PROPS = opt('--props', 'left,transform,width,height,opacity').split(',').map((s) => s.trim()).filter(Boolean);
const BOX = argv.includes('--box');
const STOP = argv.includes('--stop-on-change');

const URL_ = process.env.URL || pathToFileURL(process.cwd()).href + '/index.html?clean=1';
const puppeteer = await loadPuppeteer();
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars',
         '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', String(e.message || e).slice(0, 160)));
await page.goto(URL_, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.OPENER && window.OPENER.ready === true', { timeout: 90000 });
await page.evaluate(() => document.fonts && document.fonts.ready);

const DUR = await page.evaluate(() => window.OPENER.DURATION);
const TO = Number(opt('--to', DUR));

console.log(`elemen : ${SEL}`);
console.log(`rentang: ${FROM}s -> ${TO}s  step=${STEP}s  props=${PROPS.join(',')}`);
console.log('');

let prev = null;
let changed = 0;
for (let t = FROM; t <= TO + 1e-9; t = Number((t + STEP).toFixed(3))) {
  await page.evaluate(async (tt) => {
    if (window.OPENER.seekFrame) await window.OPENER.seekFrame(tt);
    else { window.OPENER.seek(tt); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); window.OPENER.seek(tt); }
  }, t);

  const r = await page.evaluate(({ sel, props, box }) => {
    const el = document.querySelector(sel);
    if (!el) return { missing: true };
    const cs = getComputedStyle(el);
    const out = {};
    for (const p of props) out[p] = String(cs[p] ?? '-').slice(0, 46);
    if (box) {
      const b = el.getBoundingClientRect();
      const s = document.querySelector('#stage');
      const sb = s ? s.getBoundingClientRect() : { left: 0, top: 0 };
      const fit = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fit')) || 1;
      out.rect = `x=${Math.round((b.left - sb.left) / fit)} y=${Math.round((b.top - sb.top) / fit)} ` +
                 `w=${Math.round(b.width / fit)} h=${Math.round(b.height / fit)}`;
    }
    return out;
  }, { sel: SEL, props: PROPS, box: BOX });

  if (r.missing) { console.log('  ELEMEN TIDAK DITEMUKAN — cek selector, dan pastikan ia di dalam #stage (bukan di luar #dom)'); break; }

  const sig = JSON.stringify(r);
  const isChange = prev !== null && sig !== prev;
  if (isChange) changed++;
  const mark = isChange ? '  *' : '   ';
  const body = Object.entries(r).map(([k, v]) => `${k}=${v}`).join('  ');
  console.log(`  ${String(t).padStart(6)}s${mark} ${body}`);

  if (isChange && STOP) { console.log('\n  --stop-on-change: berhenti pada perubahan pertama'); break; }
  prev = sig;
}

console.log(`\n${changed} perubahan nilai di rentang ini.`);
console.log('Cara membaca: kalau sebuah properti yang kamu SET di awal (mis. css.left=50%)');
console.log('TIDAK PERNAH muncul di kolom itu, ada yang menimpanya — curigai `fromTo`/');
console.log('`from` tanpa `immediateRender:false` yang dijadwalkan lebih belakang.');

await browser.close();
