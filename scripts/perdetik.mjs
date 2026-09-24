/* =========================================================
   VERIFIKASI PER DETIK: ukur, jangan cuma lihat.

   `snap.mjs` memotret FRAME. Itu perlu, tapi tidak cukup: ada satu kelas bug
   yang TIDAK terlihat di frame mana pun, dan sudah tiga kali lolos ke hasil
   akhir. Kelasnya: **elemen yang tidak pernah benar-benar dimatikan.**

   Terukur pada satu proyek nyata (2026-09-22), empat bug, tiga di antaranya
   mustahil ditemukan dengan melihat gambar:

     1. `ReferenceError: s5H is not defined`  -> timeline TIDAK terbangun sama
        sekali. Terlihat, tapi hanya kalau kamu membaca console.
     2. Divider duduk di `x=0` sejak frame pertama. Akarnya: `tl.fromTo(div, …)`
        yang dijadwalkan di detik 26,85 MERENDER state `from` SEGERA, menimpa
        `gsap.set(div,{left:'50%'})` yang ditulis sebelumnya. Di frame mana pun
        sebelum detik 26,85, posisinya terlihat "masuk akal" — karena itu
        tidak ada frame yang bisa membuktikannya salah.
     3. Adegan 5 teksnya nyangkut sampai akhir: adegan dipecah per `.word`, yang
        dimatikan `.word`, tapi INDUK `.headline` tetap `opacity:1`.
     4. Adegan 4 teksnya nyangkut: keluar hanya lewat `clip-path`, `opacity`
        tetap 1.

   Skrip ini menjawab ketiga-tiganya dengan ANGKA:
     (a) tumpang tindih antar elemen TEKS, per detik kunci
         (berlaku juga untuk proyek TANPA `.scene` — lihat catatan di bawah)
     (b) elemen teks yang masih terlihat padahal adegannya sudah lewat
     (c) posisi/ukuran elemen apa pun yang kamu minta lewat --watch
     (d) transform world (skala kamera) per detik

   Pakai (dari folder proyek; halaman dibuka lewat file://, tanpa server):
     node <path>/perdetik.mjs .                       # tumpang tindih + teks nyangkut
     node <path>/perdetik.mjs . --watch "#divider"    # lacak satu elemen
     node <path>/perdetik.mjs . --step 1 --json out.json
     URL="file:///C:/proyek/index.html?clean=1" node <path>/perdetik.mjs .

   Opsi:
     --step N      jarak detik kunci (default 2)
     --watch SEL   selector elemen yang dilacak (boleh berkali-kali)
     --json FILE   tulis hasil mentah
     --no-world    lewati probe transform #world

   Prasyarat: Node + puppeteer. Tanpa Node, pakai ?debug=1 dan scrub manual —
   tapi sadari bahwa tanpa pengukuran, bug kelas (b)-(d) TIDAK akan ketemu.

   Halaman harus mengekspos `window.OPENER = { DURATION, seek(t), ready }` —
   semua starter di skill ini sudah begitu. `?clean=1` menahan autoplay.
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
import { writeFile } from 'node:fs/promises';

const argv = process.argv.slice(2);
const DIR = argv.find((a) => !a.startsWith('--')) || '.';
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const STEP = Number(opt('--step', 2));
const JSONOUT = opt('--json', '');
const NO_WORLD = argv.includes('--no-world');
const WATCH = argv.reduce((acc, a, i) => (a === '--watch' ? [...acc, argv[i + 1]] : acc), []);

/* --- KELAS TEKS: kenapa ini daftar GENERIK, bukan daftar kelas proyek ---
   `check.mjs` versi pertama mencari `.line,.big,.term,.mnode,…` — kelas dari
   satu proyek lama. Kode dari model lain memakai `.headline`/`.label`, jadi
   checker melaporkan "0 elemen teks" padahal teksnya ada di layar. Checker
   yang buta akan SELALU hijau. Daftar di bawah memuat kelas generik yang
   benar-benar dipakai starter skill ini (`.txt`, `.hl-t`, `.b`) PLUS kelas
   umum yang biasa ditulis model. Perluas daftarnya tiap kali ada gaya
   penamaan baru — jangan pernah mengunci ke satu proyek. */
const TEXT_SEL = [
  'h1', 'h2', 'h3', '.txt', '.txt2', '.hl-t', '.b',
  '.headline', '.label', '.line', '.big', '.unit', '.kicker', '.caption',
].join(',');

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
} catch { /* timeline tidak terbangun — itu temuan, bukan alasan berhenti */ }
await page.evaluate(() => document.fonts && document.fonts.ready);

const DUR = ready ? await page.evaluate(() => window.OPENER.DURATION) : 0;

console.log(`URL   : ${URL_}`);
console.log(`ready : ${ready}${ready ? '' : '   <== TIMELINE TIDAK TERBANGUN'}`);
if (!ready) {
  console.log(`error : ${pageErrors.length ? pageErrors[0] : '(tidak ada pesan)'}`);
  await browser.close();
  process.exit(1);
}
console.log(`durasi: ${DUR}s   step=${STEP}s   watch=${WATCH.length ? WATCH.join(' ') : '-'}`);
console.log('');

const times = [];
for (let t = 1; t < DUR; t += STEP) times.push(Number(t.toFixed(1)));

const rows = [];
for (const t of times) {
  await page.evaluate(async (tt) => {
    if (window.OPENER.seekFrame) await window.OPENER.seekFrame(tt);
    else { window.OPENER.seek(tt); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); window.OPENER.seek(tt); }
  }, t);

  const r = await page.evaluate(({ sel, watch }) => {
    const stage = document.querySelector('#stage');
    const fit = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fit')) || 1;
    const rel = (el) => {
      const b = el.getBoundingClientRect();
      const s = stage ? stage.getBoundingClientRect() : { left: 0, top: 0 };
      return { x: (b.left - s.left) / fit, y: (b.top - s.top) / fit, w: b.width / fit, h: b.height / fit };
    };

    // --- (a)(b) teks yang BENAR-BENAR terlihat ---
    const vis = [];
    let allScenes = [...document.querySelectorAll('.scene')];
    /* PROYEK TANPA `.scene` SAMA SEKALI — ini yang bikin alat ini pernah
       melaporkan "0 teks / bersih" untuk proyek yang jelas punya teks.
       Kalau tidak ada `.scene`, seluruh dunia (#world) diperlakukan sebagai
       SATU adegan. Akibatnya penjaga induk-anak tetap berlaku (satu pohon
       tidak dihitung tabrakan), tapi teks yang saling menimpa tetap tertangkap.
       Tanpa cabang ini, detector buta persis di pola yang paling sering
       dipakai model: elemen di-tween langsung tanpa pembungkus adegan. */
    let sceneFallback = false;
    if (!allScenes.length) {
      const w = document.querySelector('#world') || document.querySelector('#stage') || document.body;
      if (w) { allScenes = [w]; sceneFallback = true; }
    }
    /* Label adegan untuk satu elemen. Kalau proyeknya tidak punya `.scene`,
       semua teks akan berlabel "world" — keluaran jadi tidak bisa membedakan
       teks mana yang bermasalah. Jadi: pakai id/kelas elemennya sendiri.
       Nama kelas pertama saja, supaya kolomnya tetap terbaca. */
    const sceneLabel = (sc, el) => {
      if (!sceneFallback) return sc.id || '(tanpa-id)';
      if (el && (el.id || el.className)) {
        const c = String(el.className || '').trim().split(/\s+/)[0];
        return el.id ? `#${el.id}` : `.${c}`;
      }
      return sc.id || '(tanpa-id)';
    };
    for (const sc of allScenes) {
      const sceneOp = parseFloat(getComputedStyle(sc).opacity);
      const sceneGone = sceneOp < 0.05;
      for (const el of sc.querySelectorAll(sel)) {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const eff = parseFloat(cs.opacity) * sceneOp;
        if (eff < 0.15) continue;
        const txt = (el.textContent || '').trim();
        if (!txt) continue;
        const cp = cs.clipPath || 'none';
        // ter-clip habis = TIDAK terlihat. getBoundingClientRect tetap
        // mengembalikan box, jadi tanpa cek ini muncul positif palsu.
        if (/inset\([^)]*100%/.test(cp)) continue;
        const R = rel(el);
        if (R.w < 2 || R.h < 2) continue;
        /* TERLIHAT = opacity cukup DAN irisannya dengan PANGGUNG nyata.
           Di proyek "dunia besar + kamera menyusuri" (kolase), teks yang
           tidak pernah dimatikan TIDAK menumpuk di layar — ia keluar frame
           karena kamera pergi. Tanpa cek irisan ini, alat melaporkan "layar
           tidak pernah kosong" untuk layar yang sebenarnya kosong, dan
           sebaliknya menghitung teks di luar frame sebagai tumpang tindih. */
        const SW = stage ? stage.getBoundingClientRect().width / fit : 1920;
        const SH = stage ? stage.getBoundingClientRect().height / fit : 1080;
        const onStage = (R.x + R.w > 4) && (R.y + R.h > 4) && (R.x < SW - 4) && (R.y < SH - 4);
        if (!onStage) continue;
        const ownOp = parseFloat(cs.opacity);
        vis.push({ el, txt: txt.slice(0, 26), scene: sceneLabel(sc, el), sceneGone,
                   ownOp: +ownOp.toFixed(2), eff: +eff.toFixed(2), ...R });
      }
    }
    const ov = [];
    for (let i = 0; i < vis.length; i++) {
      for (let j = i + 1; j < vis.length; j++) {
        const a = vis[i], b = vis[j];
        // Dua penjaga, dan keduanya perlu:
        //  1. induk vs anaknya SELALU saling menimpa (anaknya di DALAM induk)
        //     -> "kuncinya dipasang <-> kuncinya" itu satu elemen, bukan tabrakan.
        //  2. tapi teks yang TIDAK PERNAH DIMATIKAN juga sering satu pohon
        //     ("terkunci permanen" mengandung "terkunci"), jadi skip buta akan
        //     menelan bug yang sedang dicari.
        // Diskriminator yang benar: LINTAS ADEGAN. Induk-anak selalu satu adegan;
        // teks yang lupa dimatikan menabrak teks adegan LAIN.
        const bedaAdegan = a.scene !== b.scene;
        if (!bedaAdegan && (a.el.contains(b.el) || b.el.contains(a.el))) continue;
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 8 && oy > 8) ov.push(`${a.txt} <-> ${b.txt} (${Math.round(ox)}x${Math.round(oy)})`);
      }
    }

    // --- (c) elemen yang dilacak ---
    const watched = watch.map((w) => {
      const el = document.querySelector(w);
      if (!el) return { sel: w, missing: true };
      const cs = getComputedStyle(el);
      const R = rel(el);
      return { sel: w, x: Math.round(R.x), y: Math.round(R.y), w: Math.round(R.w), h: Math.round(R.h),
               cssLeft: cs.left, opacity: +parseFloat(cs.opacity).toFixed(2),
               transform: String(cs.transform).slice(0, 40), rotate: cs.rotate };
    });

    // --- (d) skala kamera ---
    let world = null;
    const w = document.querySelector('#world');
    if (w) {
      const m = String(getComputedStyle(w).transform).match(/matrix\(([-\d.]+)/);
      world = m ? +Number(m[1]).toFixed(3) : null;
    }
    // opacity SENDIRI tiap elemen, termasuk yang adegannya sudah hilang —
    // inilah sinyal "tidak pernah dimatikan" (bug #3/#4).
    const own = [];
    for (const sc of allScenes) {
      for (const el of sc.querySelectorAll(sel)) {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const txt = (el.textContent || '').trim();
        if (!txt) continue;
        own.push({ txt: txt.slice(0, 26), scene: sceneLabel(sc, el),
                   ownOp: +parseFloat(cs.opacity).toFixed(2), sceneOp: +parseFloat(getComputedStyle(sc).opacity).toFixed(2) });
      }
    }
    const strip = (arr) => arr.map(({ el, ...rest }) => rest);
    return { vis: strip(vis), ov, watched, world, own };
  }, { sel: TEXT_SEL, watch: WATCH });

  rows.push({ t, ...r });

  const wstr = r.world !== null ? `  world=${r.world}` : '';
  const flag = r.ov.length ? '  <== TUMPANG' : '';
  console.log(`  ${String(t).padStart(5)}s  ${String(r.vis.length).padStart(2)} teks${wstr}${flag}`);
  for (const o of r.ov) console.log(`          >> ${o}`);
  for (const o of r.own) {
    if (o.sceneOp < 0.05 && o.ownOp >= 0.5) {
      console.log(`          !! ${o.scene} adegan HILANG tapi "${o.txt}" masih opacity ${o.ownOp} — tidak pernah dimatikan`);
    }
  }
  for (const w of r.watched) {
    if (w.missing) { console.log(`          ?? ${w.sel} TIDAK DITEMUKAN`); continue; }
    console.log(`          .. ${w.sel}  x=${w.x} y=${w.y} w=${w.w} h=${w.h} css.left=${w.cssLeft} op=${w.opacity} rot=${w.rotate}`);
  }
}

/* --- KELAS BUG "ELEMEN TIDAK PERNAH DIMATIKAN" ---
   Sinyalnya BUKAN "terlihat lama" — teks yang memang ditahan 6 detik itu sah,
   dan detector berbasis durasi akan menandai adegan yang sehat (positif palsu).
   Sinyal yang benar, dan sudah dikumpulkan per frame di atas:
     ADEGANNYA sudah hilang (opacity < 0.05) TAPI opacity elemen itu sendiri
     masih >= 0.5.
   Itu persis bentuk bug #3 (induk `.headline` tidak ikut dimatikan) dan #4
   (keluar hanya lewat clip-path). Tidak ada satu frame pun yang bisa
   membuktikannya — butuh pembacaan per detik. */
console.log('\n=== TEKS YANG TIDAK PERNAH DIMATIKAN ===');
/* Dua pola penataan yang ditemui di lapangan, dan kenapa detector harus netral:

   POLA A (starter skill ini): tiap adegan punya `.scene` yang di-fade 0<->1.
   POLA B (proyek nyata 2026-09-22): `.scene` TIDAK pernah disentuh; yang
     di-tween langsung `.headline`/`.label`-nya, satu per satu.

   Detector yang mengandaikan "adegan hilang = opacity .scene < 0.05" BUTA
   total di pola B — dan pola B itu justru proyek tempat bug #3/#4 lahir.
   Jadi jangan mengandalkan opacity adegan.

   Sinyal yang bekerja di KEDUA pola, dan yang dipakai catatan asli sebagai
   bukti: **TUMPANG TINDIH antar teks di detik yang sama.** Teks yang tidak
   pernah dimatikan pasti menabrak teks adegan berikutnya. Baris `>>` di atas
   adalah buktinya; ringkasannya di sini. */
const orphanHits = new Map();
for (const row of rows) {
  for (const o of row.ov || []) {
    orphanHits.set(o, (orphanHits.get(o) || 0) + 1);
  }
}
const sceneOpacityUsed = rows.some((r) => (r.own || []).some((o) => o.sceneOp < 0.95));

console.log(`  pola penataan terdeteksi : ${sceneOpacityUsed ? 'A (adegan di-fade)' : 'B (elemen di-tween langsung)'}`);
if (!orphanHits.size) {
  console.log('  (bersih — tidak ada dua teks yang tampil saling menimpa)');
} else {
  for (const [pair, n] of orphanHits) console.log(`  ${pair}  x${n} pembacaan`);
  console.log('  perbaikan: matikan INDUK di level yang sama dengan masuknya —');
  console.log('             kalau masuknya per-kata, keluarnya juga per-kata + induk autoAlpha:0.');
}

/* Durasi hidup tiap teks — DILAPORKAN, tidak dihakimi. Teks yang memang
   ditahan lama itu sah; yang tidak sah adalah yang menabrak teks lain. */
/* Sinyal kedua, dan ini yang menangkap pola B: kalau ada teks yang hidup
   TERUS-MENERUS dari satu adegan ke adegan berikutnya, jumlah teks terlihat
   tidak pernah turun ke 0 di antara adegan. Adegan yang sehat punya jeda. */
console.log('\n=== KESINAMBUNGAN (apakah layar pernah benar-benar kosong?) ===');
let longestRun = 0, curRun = 0, runStart = 0;
const neverEmpty = [];
for (const row of rows) {
  if (row.vis.length > 0) { if (curRun === 0) runStart = row.t; curRun++; }
  else { if (curRun > longestRun) { longestRun = curRun; neverEmpty.push([runStart, row.t - STEP]); } curRun = 0; }
}
if (curRun > longestRun) { longestRun = curRun; neverEmpty.push([runStart, rows[rows.length - 1].t]); }
console.log(`  rentang terpanjang tanpa layar kosong: ${longestRun} pembacaan x ${STEP}s = ${(longestRun * STEP).toFixed(1)}s`);
if (longestRun * STEP > 8) {
  console.log('  <-- panjang. Kalau ini bukan gaya yang disengaja (teks yang sengaja');
  console.log('      ditahan), curigai teks yang tidak pernah dimatikan (bug #3/#4).');
  for (const [a, b] of neverEmpty) console.log(`      ${a}s..${b}s`);
}

console.log('\n=== DURASI HIDUP TIAP TEKS (informasi, bukan putusan) ===');
const span = new Map();
for (const row of rows) {
  for (const v of row.vis) {
    const k = `${v.scene}|${v.txt}`;
    const s = span.get(k) || { scene: v.scene, txt: v.txt, first: row.t, last: row.t, n: 0 };
    s.last = row.t; s.n++;
    span.set(k, s);
  }
}
for (const s of [...span.values()].sort((a, b) => (b.last - b.first) - (a.last - a.first))) {
  const dur = +(s.last - s.first).toFixed(1);
  const mark = dur >= 6 ? '  <-- panjang, pastikan disengaja' : '';
  console.log(`  ${String(dur).padStart(5)}s  ${s.scene.padEnd(10)} "${s.txt}"${mark}`);
}

if (pageErrors.length) {
  console.log('\n=== ERROR HALAMAN ===');
  for (const e of pageErrors.slice(0, 8)) console.log('  ' + e);
}

if (JSONOUT) {
  await writeFile(JSONOUT, JSON.stringify({
    url: URL_, dur: DUR, step: STEP, rows,
    tumpang_tindih: Object.fromEntries(orphanHits), pageErrors }, null, 1));
  console.log(`\nraw -> ${JSONOUT}`);
}

await browser.close();
console.log('\nselesai');
