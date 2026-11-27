// Sinkron OTOMATIS kalender makro dari sumber resmi, tiap build (di-cache supaya tidak membebani situs sumber):
//  - BLS  : bls.gov/schedule/news_release/cpi.htm dan empsit.htm  (CPI, NFP/Employment Situation); cadangan: bls.ics
//  - Fed  : federalreserve.gov/monetarypolicy/fomccalendars.htm   (tanggal keputusan FOMC, termasuk rapat strategi tanpa keputusan)
// Bila situs sumber gagal/diblok, monitor memakai cache terakhir lalu data/events.json (statis). Tidak pernah membuat build gagal.
import { etToMs } from './makro.mjs';
const H = 36e5, pad = n => String(n).padStart(2, '0');
const MN = 'January|February|March|April|May|June|July|August|September|October|November|December';
const M3 = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
const mon = s => { const k = String(s).slice(0, 3), c = k.charAt(0).toUpperCase() + k.slice(1).toLowerCase(); return 1 + M3.split('|').indexOf(c); };
export const URLS = {
  CPI: 'https://www.bls.gov/schedule/news_release/cpi.htm',
  NFP: 'https://www.bls.gov/schedule/news_release/empsit.htm',
  ICS: 'https://www.bls.gov/schedule/news_release/bls.ics',
  FED: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'
};

export function htmlToText(h) {
  return String(h).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&ndash;|&#8211;/g, '–').replace(/\s+/g, ' ').trim();
}
const dowOk = (y, m, d) => { const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return w >= 1 && w <= 5; };

// Tabel BLS: "<Bulan referensi> <tahun> <Mon.> <tgl>, <tahun> <jam>:<menit> AM|PM" (waktu Eastern)
export function parseBlsTable(text) {
  const re = new RegExp(`(${MN})\\s+(\\d{4})\\s+([A-Za-z]{3,9})\\.?\\s+(\\d{1,2}),\\s*(\\d{4})\\s+(\\d{1,2}):(\\d{2})\\s*(AM|PM)`, 'gi');
  const set = new Map();
  for (const m of String(text).matchAll(re)) {
    const mo = mon(m[3]), y = +m[5], d = +m[4];
    let hh = +m[6] % 12 + (/pm/i.test(m[8]) ? 12 : 0);
    if (!(mo >= 1 && mo <= 12) || y < 2020 || y > 2100 || !dowOk(y, mo, d)) continue;
    const et = `${y}-${pad(mo)}-${pad(d)} ${pad(hh)}:${m[7]}`;
    set.set(et, { et });
  }
  return [...set.values()].sort((a, b) => a.et < b.et ? -1 : 1);
}

// ICS BLS (cadangan). Toleran terhadap TZID/UTC/tanggal saja.
export function msToEt(ms) {
  for (const off of [4, 5]) { const d = new Date(ms - off * H), s = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; if (etToMs(s) === ms) return s; }
  return null;
}
export function parseIcs(text) {
  const out = { CPI: new Map(), NFP: new Map() };
  const blocks = String(text).replace(/\r?\n[ \t]/g, '').split(/BEGIN:VEVENT/i).slice(1);
  for (const b of blocks) {
    const sum = (/^SUMMARY[^:]*:(.*)$/mi.exec(b) || [])[1]?.trim() || '', ds = /^DTSTART([^:\r\n]*):(\S+)/mi.exec(b);
    if (!ds) continue;
    const kind = /^consumer price index\b/i.test(sum) && !/area|region|metro|average price|real earnings|import|expenditure/i.test(sum) ? 'CPI'
      : /^employment situation\b/i.test(sum) && !/veteran|metropolitan|state|county|youth/i.test(sum) ? 'NFP' : null;
    if (!kind) continue;
    const mm = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/.exec(ds[2]);
    if (!mm) continue;
    let et;
    if (mm[7]) et = msToEt(Date.UTC(+mm[1], +mm[2] - 1, +mm[3], +mm[4], +mm[5]));
    else et = `${mm[1]}-${mm[2]}-${mm[3]} ${mm[4] ? mm[4] + ':' + mm[5] : '08:30'}`;
    if (et) out[kind].set(et, { et });
  }
  return { CPI: [...out.CPI.values()].sort((a, b) => a.et < b.et ? -1 : 1), NFP: [...out.NFP.values()].sort((a, b) => a.et < b.et ? -1 : 1) };
}

// Fed: "#### 2026 FOMC Meetings" lalu per rapat "<Bulan> <tgl1>-<tgl2>"; "Apr/May 30-1" = lintas bulan; keputusan = hari ke-2.
// Rapat strategi ditandai "Monetary Policy Strategy Meeting" (tanpa keputusan suku bunga).
export function parseFed(text, minYear = 2020) {
  let t = String(text);
  const extra = [];
  t = t.replace(new RegExp(`(?:two-day )?meeting is scheduled for (${MN})\\s+(\\d{1,2})\\s*[-–]\\s*(\\d{1,2}),\\s*(\\d{4})`, 'gi'), (_, mo, a, b, y) => { extra.push({ y: +y, mo: mon(mo), d: +b }); return ' '; });
  const heads = [...t.matchAll(/(\d{4}) FOMC Meetings/g)].map(m => ({ y: +m[1], i: m.index }));
  const res = [];
  heads.forEach((h, k) => {
    if (h.y < minYear) return;
    const seg = t.slice(h.i, k + 1 < heads.length ? heads[k + 1].i : undefined);
    const re = new RegExp(`\\b(${MN}|(?:${M3})\\/(?:${M3}))\\s+(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})\\*?`, 'g');
    const ms = [...seg.matchAll(re)], rows = [];
    ms.forEach((m, j) => {
      const parts = m[1].split('/'), d1 = +m[2], d2 = +m[3], mo = mon(parts[parts.length - 1]);
      if (parts.length === 1 && d2 < d1) return;
      if (!(mo >= 1 && mo <= 12) || d2 < 1 || d2 > 31) return;
      const after = seg.slice(m.index + m[0].length, j + 1 < ms.length ? ms[j + 1].index : m.index + m[0].length + 200).slice(0, 200);
      rows.push({ tgl: `${h.y}-${pad(mo)}-${pad(d2)}`, strategi: /strategy meeting/i.test(after) });
    });
    if (rows.length >= 5 && rows.length <= 9) res.push(...rows);
  });
  for (const x of extra) if (x.y >= minYear && x.mo >= 1) res.push({ tgl: `${x.y}-${pad(x.mo)}-${pad(x.d)}`, strategi: false });
  const u = new Map(); for (const r of res) u.set(r.tgl, r);
  return [...u.values()].sort((a, b) => a.tgl < b.tgl ? -1 : 1);
}

const DEFS = { aktif: true, jamCache: 6, timeoutMs: 20000, userAgent: 'monitor-kalender/1.0 (kalender makro pribadi; GitHub Actions)' };

export async function syncKalender({ cfg = {}, now = Date.now(), cacheUrl = null, fetchFn = globalThis.fetch, local = false } = {}) {
  const S = { ...DEFS, ...cfg };
  if (!S.aktif || local) return { status: 'nonaktif', events: {}, fontes: {}, simpan: null, galat: [] };
  let prev = null;
  if (cacheUrl) { try { const r = await fetchFn(cacheUrl, { signal: AbortSignal.timeout(10000) }); if (r.ok) { const j = await r.json(); if (j && j.v === 1 && j.events) prev = j; } } catch { /* tanpa cache */ } }
  if (prev && prev.ok && now - prev.t >= 0 && now - prev.t < S.jamCache * H) return { status: 'cache', t: prev.t, events: prev.events, fontes: prev.fontes || {}, simpan: null, galat: [] };

  const get = async url => {
    const r = await fetchFn(url, { headers: { 'User-Agent': S.userAgent, Accept: 'text/html,application/xhtml+xml,text/calendar;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(S.timeoutMs), redirect: 'follow' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  };
  const galat = [], ev = {}, fon = {};
  let ics = null;
  const icsGet = async () => ics ??= parseIcs(await get(URLS.ICS));
  for (const k of ['CPI', 'NFP']) {
    let rows = [], via = 'html', err = null;
    try { rows = parseBlsTable(htmlToText(await get(URLS[k]))); if (rows.length < 3) err = `halaman BLS terbaca tetapi hanya ${rows.length} tanggal (format berubah?)`; } catch (x) { err = x.message; }
    if (rows.length < 3) { try { const i = await icsGet(); if (i[k].length >= 3) { rows = i[k]; via = 'ics'; err = null; } } catch (x) { err = (err ? err + '; ' : '') + 'ICS: ' + x.message; } }
    if (rows.length >= 3) { ev[k] = rows; fon[k] = { ok: true, n: rows.length, via, t: now }; } else { fon[k] = { ok: false, n: 0, galat: err || 'kosong' }; galat.push(`BLS ${k}: ${err || 'kosong'}`); }
  }
  {
    let rows = [], err = null;
    try { rows = parseFed(htmlToText(await get(URLS.FED)), new Date(now).getUTCFullYear()); if (rows.length < 5) err = `halaman Fed terbaca tetapi hanya ${rows.length} rapat (format berubah?)`; } catch (x) { err = x.message; }
    if (rows.length >= 5) { ev.FOMC = rows.map(r => ({ et: r.tgl + ' 14:00', strategi: r.strategi })); fon.FOMC = { ok: true, n: rows.length, via: 'html', t: now }; }
    else { fon.FOMC = { ok: false, n: 0, galat: err || 'kosong' }; galat.push(`Fed FOMC: ${err || 'kosong'}`); }
  }
  // sumber yang gagal memakai cache sebelumnya bila ada
  for (const k of ['CPI', 'NFP', 'FOMC']) if (!fon[k].ok && prev?.events?.[k]?.length) { ev[k] = prev.events[k]; fon[k] = { ...fon[k], stale: true, t: prev.fontes?.[k]?.t ?? prev.t }; }
  const okAll = ['CPI', 'NFP', 'FOMC'].every(k => fon[k].ok), okAny = ['CPI', 'NFP', 'FOMC'].some(k => fon[k].ok);
  const adaData = Object.keys(ev).length > 0;
  const status = okAll ? 'live' : okAny ? 'sebagian' : adaData ? 'cache-lama' : 'statis';
  const simpan = okAny ? { v: 1, t: now, ok: okAll, events: ev, fontes: fon } : (prev ?? null);
  return { status, t: okAny ? now : (prev?.t ?? null), events: ev, fontes: fon, simpan, galat };
}
