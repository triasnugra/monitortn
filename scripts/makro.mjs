// Lapisan KALENDER MAKRO untuk monitor. TIDAK mengubah mesin. Semua jendela waktu = HIPOTESIS yang diuji lewat data.
// Sumber tanggal: data/events.json (Fed, BLS). FOMC-minutes dan opsi Deribit dihitung dari aturan (lihat README).
import fs from 'node:fs';
const H = 36e5, DAY = 864e5;
export const DEF = {
  aktif: true, warnJam: 72, kuningJam: 24, merahJam: 2,
  sebelumJam: { tinggi: 4, sedang: 2 }, sesudahJam: { tinggi: 8, sedang: 4 },
  opex: true, minKalenderHari: 21
};
const pad = n => String(n).padStart(2, '0');
const isoMin = ms => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
const wibStr = ms => isoMin(ms + 7 * H);

// ---- Waktu Eastern -> UTC (DST AS: Minggu ke-2 Maret s/d Minggu ke-1 November) ----
function nthSunday(y, m0, n) { const first = (7 - new Date(Date.UTC(y, m0, 1)).getUTCDay()) % 7; return 1 + first + 7 * (n - 1); }
export function etToMs(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(str);
  if (!m) throw new Error('format waktu ET salah: ' + str);
  const [y, mo, d, hh, mm] = m.slice(1).map(Number);
  const t = Date.UTC(y, mo - 1, d);
  const dst = t >= Date.UTC(y, 2, nthSunday(y, 2, 2)) && t < Date.UTC(y, 10, nthSunday(y, 10, 1));
  return Date.UTC(y, mo - 1, d, hh + (dst ? 4 : 5), mm);
}
function lastFriday(y, m0) { const d = new Date(Date.UTC(y, m0 + 1, 0)); return d.getUTCDate() - ((d.getUTCDay() - 5 + 7) % 7); }

export function loadCalendar(cfg, file = 'data/events.json', auto = null, now = null) {
  let raw; try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (x) { return { versi: null, galat: 'events.json tidak terbaca: ' + x.message, events: [] }; }
  // 1) dasar = data/events.json (statis, cadangan + riwayat). 2) data sinkron resmi (BLS/Fed) MENGGANTIKAN tanggal statis
  //    dari tanggal pertama yang tercantum di sumber itu dan seterusnya (sehingga perubahan jadwal resmi ikut), tanggal lebih awal tetap.
  let base = (raw.events || []).map(e => ({ ...e }));
  const GR = { CPI: ['CPI'], NFP: ['NFP'], FOMC: ['FOMC', 'FOMC-STRATEGI'] };
  const NM = { CPI: 'CPI AS (inflasi konsumen)', NFP: 'Employment Situation / NFP AS (data tenaga kerja)' };
  for (const k of ['CPI', 'NFP', 'FOMC']) {
    const a = auto?.events?.[k]; if (!a?.length) continue;
    const minT = Math.min(...a.map(x => etToMs(x.et)));
    base = base.filter(e => !(GR[k].includes(e.jenis) && etToMs(e.et) >= minT));
    for (const x of a) {
      if (k === 'FOMC') base.push(x.strategi
        ? { jenis: 'FOMC-STRATEGI', nama: 'Rapat FOMC khusus strategi: TANPA keputusan suku bunga', et: x.et, impact: 'rendah', sumber: 'federalreserve.gov (sinkron otomatis)', minutes: false }
        : { jenis: 'FOMC', nama: 'Keputusan suku bunga FOMC + konferensi pers (14:00 ET)', et: x.et, impact: 'tinggi', sumber: 'federalreserve.gov (sinkron otomatis)', minutes: true });
      else base.push({ jenis: k, nama: NM[k], et: x.et, impact: 'tinggi', sumber: 'bls.gov (sinkron otomatis)' });
    }
  }
  const ev = [], seen = new Set();
  for (const e of base) {
    const id = `${e.jenis.toLowerCase()}-${e.et.slice(0, 10)}`;
    if (seen.has(id)) continue; seen.add(id);
    const t = etToMs(e.et);
    ev.push({ id, jenis: e.jenis, nama: e.nama, impact: e.impact, t, sumber: e.sumber || '' });
    if (e.jenis === 'FOMC' && e.minutes !== false) {
      const d = new Date(Date.parse(e.et.slice(0, 10)) + 21 * DAY).toISOString().slice(0, 10);
      ev.push({ id: 'fomc-min-' + d, jenis: 'FOMC-MINUTES', nama: 'Risalah rapat FOMC (14:00 ET)', impact: 'sedang', t: etToMs(d + ' 14:00'), sumber: 'aturan Fed: 3 minggu setelah keputusan' });
    }
  }
  if (cfg.opex && ev.length) {
    const lo = new Date(Math.min(...ev.map(e => e.t))), hi = new Date(Math.max(now != null ? now + 400 * DAY : 0, ...ev.map(e => e.t)));
    for (let y = lo.getUTCFullYear(), m = lo.getUTCMonth(); y < hi.getUTCFullYear() || (y === hi.getUTCFullYear() && m <= hi.getUTCMonth()); m++) {
      if (m > 11) { m = 0; y++; }
      const q = [2, 5, 8, 11].includes(m), t = Date.UTC(y, m, lastFriday(y, m), 8, 0);
      ev.push({ id: 'opex-' + new Date(t).toISOString().slice(0, 10), jenis: q ? 'OPEX-KUARTAL' : 'OPEX', nama: q ? 'Kedaluwarsa opsi kuartalan Deribit (besar)' : 'Kedaluwarsa opsi bulanan Deribit', impact: q ? 'sedang' : 'rendah', t, sumber: 'aturan Deribit: Jumat terakhir 08:00 UTC (verifikasi di deribit.com)' });
    }
  }
  ev.sort((a, b) => a.t - b.t);
  return { versi: raw.versi, catatan: raw.catatan, events: ev };
}

const fmtJam = h => { const a = Math.abs(h); return a < 1 ? Math.round(a * 60) + ' menit' : a < 48 ? a.toFixed(1) + ' jam' : (a / 24).toFixed(1) + ' hari'; };
const meanSe = a => { const n = a.length; if (!n) return { n: 0, r: null, se: null }; const m = a.reduce((x, y) => x + y, 0) / n; return { n, r: m, se: n > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1) / n) : null }; };

export function inWindow(t, ev, cfg) {
  if (!cfg.sebelumJam[ev.impact]) return false;
  return t >= ev.t - cfg.sebelumJam[ev.impact] * H && t <= ev.t + cfg.sesudahJam[ev.impact] * H;
}

// trades: [{t: ms waktu acuan (saat entry/sinyal), r: R bersih|null, tp: bool}]
export function macroLayer({ cfg: c0, now, trades = [], file, auto = null }) {
  const cfg = { ...DEF, ...(c0 || {}), sebelumJam: { ...DEF.sebelumJam, ...(c0?.sebelumJam || {}) }, sesudahJam: { ...DEF.sesudahJam, ...(c0?.sesudahJam || {}) } };
  const W = [], res = { aktif: cfg.aktif };
  if (!cfg.aktif) return { makro: res, warnings: W, md: '' };
  const cal = loadCalendar(cfg, file, auto, now);
  if (cal.galat) { W.push({ lvl: 'kuning', e: 'makro', t: cal.galat, aksi: 'Periksa data/events.json' }); return { makro: { aktif: true, galat: cal.galat }, warnings: W, md: '\n## Kalender makro\n- ' + cal.galat + '\n' }; }
  const E = cal.events;
  const view = e => ({ id: e.id, jenis: e.jenis, nama: e.nama, impact: e.impact, utc: new Date(e.t).toISOString(), wib: wibStr(e.t), sebelumJam: cfg.sebelumJam[e.impact] || 0, sesudahJam: cfg.sesudahJam[e.impact] || 0 });

  // peringatan ke depan / sedang berlangsung
  const aktifE = [];
  for (const e of E) {
    const dh = (e.t - now) / H, ses = cfg.sesudahJam[e.impact] || 0;
    if (dh > cfg.warnJam || dh < -ses) continue;
    const hi = e.impact === 'tinggi' || e.impact === 'sedang';
    if (!hi && dh > 24) continue;
    if (!hi && dh < 0) continue;
    let lvl = 'info';
    if (hi) { if (dh <= cfg.merahJam && dh >= -cfg.merahJam) lvl = 'merah'; else if (dh <= cfg.kuningJam) lvl = 'kuning'; }
    const rel = dh >= 0 ? fmtJam(dh) + ' lagi' : fmtJam(dh) + ' lalu';
    aktifE.push({ ...view(e), inJam: dh, lvl });
    const aksi = e.impact === 'tinggi'
      ? 'Pertimbangkan tidak membuka posisi baru sampai reaksi pertama reda; limit dekat harga bisa terisi saat lonjakan lalu berbalik. Hanya peringatan: mesin tidak diubah.'
      : e.impact === 'sedang' ? 'Volatilitas/pin harga sekitar waktu ini sering lebih besar. Info saja.' : null;
    W.push({ lvl, e: 'makro', t: `${e.nama}: ${rel} (${wibStr(e.t)} WIB / ${isoMin(e.t)} UTC)`, aksi });
  }
  res.aktifE = aktifE;
  res.berikut = E.filter(e => e.t >= now - (cfg.sesudahJam[e.impact] || 0) * H).slice(0, 12).map(view);
  res.versi = cal.versi;
  const SK = auto || { status: 'nonaktif', fontes: {}, galat: [] };
  const NMF = { CPI: 'BLS CPI', NFP: 'BLS NFP', FOMC: 'Fed FOMC' };
  res.sinkron = { status: SK.status, t: SK.t ? new Date(SK.t).toISOString() : null, fontes: ['CPI', 'NFP', 'FOMC'].filter(k => SK.fontes?.[k]).map(k => ({ s: NMF[k], ok: !!SK.fontes[k].ok, n: SK.fontes[k].n || 0, stale: !!SK.fontes[k].stale, galat: SK.fontes[k].galat || null })) };

  // status sinkron otomatis
  const horizon = (Math.max(0, ...E.filter(e => e.impact === 'tinggi').map(e => e.t)) - now) / DAY;
  if (['sebagian', 'cache-lama', 'statis'].includes(SK.status)) {
    const bad = (SK.galat || []).join('; ') || 'sumber resmi tidak terjangkau';
    W.push({ lvl: SK.status === 'sebagian' || horizon > 120 ? 'info' : 'kuning', e: 'makro', t: `Sinkron kalender otomatis ${SK.status === 'sebagian' ? 'sebagian gagal' : 'gagal'}: ${bad}`, aksi: SK.status === 'statis' ? 'Memakai data/events.json (statis). Bila terus gagal, situs sumber mungkin memblokir runner GitHub: perbarui events.json manual.' : 'Memakai cache/data statis terakhir sampai sumber pulih.' });
  }
  // kalender hampir habis
  const lastHi = Math.max(0, ...E.filter(e => e.impact === 'tinggi').map(e => e.t));
  if ((lastHi - now) / DAY < cfg.minKalenderHari) W.push({ lvl: 'kuning', e: 'makro', t: `Kalender makro hampir habis (rilis berdampak tinggi terakhir: ${isoMin(lastHi)} UTC)`, aksi: 'Perbarui data/events.json dari bls.gov/schedule dan federalreserve.gov/monetarypolicy/fomccalendars.htm' });
  if (E.some(e => e.jenis === 'FOMC' && e.t > now && e.t < now + 60 * DAY && Date.parse(e.id.slice(5)) > Date.parse('2026-12-31'))) W.push({ lvl: 'info', e: 'makro', t: 'Tanggal FOMC 2027 masih tentatif (dikonfirmasi pada rapat sebelumnya)', aksi: null });

  // uji jendela event (hipotesis): trade yang dibuka dekat event vs di luar
  const hiE = E.filter(e => cfg.sebelumJam[e.impact]);
  const T = trades.filter(x => Number.isFinite(x.t) && x.r != null);
  const near = x => hiE.filter(e => inWindow(x.t, e, cfg));
  const dekat = T.filter(x => near(x).length), luar = T.filter(x => !near(x).length);
  const row = (g, a) => ({ g, ...meanSe(a.map(x => x.r)), tp: a.filter(x => x.tp).length });
  const per = {};
  for (const x of T) for (const e of near(x)) (per[e.jenis] ??= []).push(x);
  res.uji = {
    grup: [row('dekat event (jendela)', dekat), row('di luar jendela', luar)],
    perJenis: Object.entries(per).map(([j, a]) => row(j, a)),
    jendela: { sebelumJam: cfg.sebelumJam, sesudahJam: cfg.sesudahJam },
    catatan: 'Hipotesis: trade yang dibuka tepat sebelum/sesudah rilis berdampak tinggi berkinerja lebih buruk. Waktu acuan = waktu masuk/sinyal. Gabungan semua mesin (sinyal antar mesin berkorelasi, jadi n efektif lebih kecil dari n). Selisih R/trade kurang dari sekitar 2 galat baku (±) belum berarti; jangan jadikan aturan sebelum puluhan trade per grup. Satu trade dapat masuk beberapa jenis.'
  };
  if (dekat.length >= 30 && luar.length >= 30) {
    const a = meanSe(dekat.map(x => x.r)), b = meanSe(luar.map(x => x.r)), se = Math.sqrt((a.se ?? 0) ** 2 + (b.se ?? 0) ** 2);
    if (se > 0 && (b.r - a.r) / se > 2) W.push({ lvl: 'info', e: 'makro', t: `Trade dekat event rilis lebih buruk secara nyata: ${a.r.toFixed(2)}R (n=${a.n}) vs ${b.r.toFixed(2)}R (n=${b.n}) di luar jendela`, aksi: 'Pertimbangkan menjadikan jendela event sebagai aturan BARU lewat protokol forward test baru, bukan mengubah mesin berjalan' });
  }

  // markdown untuk "Laporan untuk Claude"
  const f2 = x => x == null ? '-' : x.toFixed(2);
  let md = '\n## Kalender makro (FOMC, CPI, NFP, opsi Deribit)\n';
  md += res.berikut.slice(0, 8).map(e => `- ${e.wib} WIB · ${e.jenis} [${e.impact}] ${e.nama}`).join('\n') + '\n';
  if (aktifE.length) md += '- Peringatan aktif: ' + aktifE.map(e => `${e.jenis} ${e.inJam >= 0 ? 'T-' : 'T+'}${fmtJam(e.inJam)} (${e.lvl})`).join('; ') + '\n';
  md += `- Sinkron kalender: ${res.sinkron.status}${res.sinkron.fontes.length ? ' (' + res.sinkron.fontes.map(f => f.s + (f.ok ? ' ok' : ' GAGAL') + (f.stale ? ' [cache]' : '')).join(', ') + ')' : ''}\n`;
  md += `\n### Uji jendela event (hipotesis; jendela tinggi -${cfg.sebelumJam.tinggi}j/+${cfg.sesudahJam.tinggi}j, sedang -${cfg.sebelumJam.sedang}j/+${cfg.sesudahJam.sedang}j)\n`;
  md += res.uji.grup.map(g => `- ${g.g}: n=${g.n}, TP=${g.tp}, R/trade ${f2(g.r)}${g.se != null ? ' ± ' + f2(g.se) : ''}`).join('\n') + '\n';
  if (res.uji.perJenis.length) md += res.uji.perJenis.map(g => `- ${g.g}: n=${g.n}, R/trade ${f2(g.r)}${g.se != null ? ' ± ' + f2(g.se) : ''}`).join('\n') + '\n';
  md += `- ${res.uji.catatan}\n`;
  return { makro: res, warnings: W, md };
}
