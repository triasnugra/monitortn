import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBlsTable, parseFed, parseIcs, htmlToText, syncKalender, URLS, msToEt } from '../scripts/kalender-sync.mjs';
import { loadCalendar, macroLayer, DEF } from '../scripts/makro.mjs';
const FILE = new URL('../data/events.json', import.meta.url).pathname;
const NOW = Date.parse('2026-11-27T10:00:00Z');

// ---- fixture meniru struktur asli halaman Fed (heading per tahun, "Month d-d", rapat strategi, catatan 2028) ----
const mt = (bulan, tgl, extra = '') => `<div class="fomc-meeting__month"><strong>${bulan}</strong></div><div class="fomc-meeting__date">${tgl}</div>${extra}`;
const rel = d => `<p>Minutes: <a href="#">PDF</a> | <a href="#">HTML</a> (Released ${d})</p>`;
const FED = `<html><nav>2026 | 2025 Future Year: 2027</nav>
<h4>2026 FOMC Meetings</h4>${mt('January', '27-28', rel('February 18, 2026'))}${mt('March', '17-18*', rel('April 08, 2026'))}${mt('April', '28-29')}${mt('June', '16-17*')}${mt('July', '28-29')}${mt('September', '15-16*')}${mt('October', '27-28', rel('November 18, 2026'))}${mt('December', '8-9*')}<p>* Meeting associated with a Summary of Economic Projections.</p>
<h4>2025 FOMC Meetings</h4>${mt('January', '28-29')}${mt('March', '18-19*')}${mt('May', '6-7')}${mt('June', '17-18*')}${mt('July', '29-30')}${mt('August', '22 (notation vote)')}${mt('September', '16-17*')}${mt('October', '28-29')}${mt('December', '9-10*')}
<h4>2024 FOMC Meetings</h4>${mt('Apr/May', '30-1')}
<h4>2027 FOMC Meetings</h4>${mt('January', '26-27')}${mt('March', '16-17')}${mt('April', '27-28')}${mt('June', '8-9')}${mt('July', '27-28')}${mt('September', '14-15')}${mt('October', '26-27', '<p>Monetary Policy Strategy Meeting</p>')}${mt('November', '16-17')}
<p>Note: A two-day meeting is scheduled for January 25-26, 2028. Each meeting date is tentative until confirmed at the meeting immediately preceding it.</p></html>`;
const bls = (rows) => `<table><tr><th>Reference Month<th>Release Date<th>Release Time</tr>${rows.map(r => `<tr><td>${r[0]}<td>${r[1]}<td>${r[2]}</tr>`).join('')}</table>`;
const CPI = bls([['May 2026', 'Jun. 13, 2026', '08:30 AM'] /* Sabtu: harus ditolak */, ['October 2026', 'Nov. 10, 2026', '08:30 AM'], ['November 2026', 'Dec. 10, 2026', '08:30 AM'], ['December 2026', 'Jan. 13, 2027', '08:30 AM'], ['December 2027', 'Jan. 12, 2028', '08:30 AM']]);
const NFP = bls([['November 2026', 'Dec. 04, 2026', '08:30 AM'], ['December 2026', 'Jan. 08, 2027', '08:30 AM'], ['January 2027', 'Feb. 05, 2027', '08:30 AM'], ['December 2027', 'Jan. 07, 2028', '08:30 AM']]);
const ICS = ['CPI|Consumer Price Index|20261210T083000|;TZID=America/New_York', 'CPI|Consumer Price Index|20270113T133000Z|', 'CPI|Consumer Price Index|20270211T083000|;TZID=America/New_York', 'CPI|Consumer Price Index - Phoenix area|20270112T083000|;TZID=America/New_York',
  'NFP|Employment Situation|20261204T083000|;TZID=America/New_York', 'NFP|Employment Situation|20270108T133000Z|', 'NFP|Employment Situation|20270205T083000|;TZID=America/New_York']
  .map(x => { const [, s, d, z] = x.split('|').length === 4 ? ['', ...x.split('|').slice(1)] : x.split('|'); const p = x.split('|'); return `BEGIN:VEVENT\r\nSUMMARY:${p[1]}\r\nDTSTART${p[3]}:${p[2]}\r\nEND:VEVENT`; }).join('\r\n');

const resp = (body, ok = true, status = 200) => ({ ok, status, text: async () => body, json: async () => JSON.parse(body) });
const mkFetch = (map, calls = []) => async url => { calls.push(url); const k = Object.keys(map).find(x => url.startsWith(x)); if (!k) return resp('', false, 404); const v = map[k]; return typeof v === 'function' ? v() : v; };
const LIVE = { [URLS.CPI]: resp(CPI), [URLS.NFP]: resp(NFP), [URLS.FED]: resp(FED), [URLS.ICS]: resp(ICS) };

test('parser Fed: tahun, lintas bulan, notation vote, rapat strategi, catatan 2028', () => {
  const r = parseFed(htmlToText(FED), 2026);
  assert.deepEqual(r.filter(x => x.tgl.startsWith('2026')).map(x => x.tgl), ['2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09']);
  assert.ok(!r.some(x => x.tgl.startsWith('2025') || x.tgl.startsWith('2024')));   // di bawah minYear
  const y27 = r.filter(x => x.tgl.startsWith('2027'));
  assert.equal(y27.length, 8);
  assert.deepEqual(y27.find(x => x.tgl === '2027-10-27'), { tgl: '2027-10-27', strategi: true });
  assert.ok(y27.find(x => x.tgl === '2027-11-17' && !x.strategi));
  assert.ok(!y27.some(x => x.tgl === '2027-12-08'));
  assert.ok(r.some(x => x.tgl === '2028-01-26'));
  const lintas = parseFed(htmlToText(FED), 2024).find(x => x.tgl.startsWith('2024'));  // 2024 hanya 1 rapat -> dibuang (validasi 5-9)
  assert.equal(lintas, undefined);
  assert.deepEqual(parseFed('halaman kosong'), []);
});

test('parser BLS: tolak hari libur/akhir pekan, urut, tahun 2028 terbaca', () => {
  const c = parseBlsTable(htmlToText(CPI));
  assert.deepEqual(c.map(x => x.et), ['2026-11-10 08:30', '2026-12-10 08:30', '2027-01-13 08:30', '2028-01-12 08:30']);
  assert.equal(parseBlsTable('Release Time 12:00 PM').length, 0);
});

test('parser ICS: TZID, UTC->ET, abaikan CPI regional', () => {
  const i = parseIcs(ICS);
  assert.deepEqual(i.CPI.map(x => x.et), ['2026-12-10 08:30', '2027-01-13 08:30', '2027-02-11 08:30']);
  assert.deepEqual(i.NFP.map(x => x.et), ['2026-12-04 08:30', '2027-01-08 08:30', '2027-02-05 08:30']);
  assert.equal(msToEt(Date.parse('2027-04-13T12:30:00Z')), '2027-04-13 08:30');
});

test('sync live: semua sumber ok, hasil disimpan', async () => {
  const s = await syncKalender({ now: NOW, fetchFn: mkFetch(LIVE) });
  assert.equal(s.status, 'live');
  assert.equal(s.events.CPI.length, 4); assert.equal(s.events.NFP.length, 4); assert.ok(s.events.FOMC.length >= 16);
  assert.ok(s.simpan.ok && s.simpan.v === 1 && s.simpan.t === NOW);
  assert.deepEqual(s.galat, []);
});

test('sync: cache segar dipakai tanpa menyentuh situs sumber', async () => {
  const live = await syncKalender({ now: NOW, fetchFn: mkFetch(LIVE) });
  const calls = [];
  const f = mkFetch({ 'https://x.github.io/': resp(JSON.stringify({ ...live.simpan, t: NOW - 3 * 36e5 })) }, calls);
  const s = await syncKalender({ now: NOW, fetchFn: f, cacheUrl: 'https://x.github.io/k.json' });
  assert.equal(s.status, 'cache'); assert.equal(calls.length, 1);
});

test('sync: situs memblokir tanpa cache -> statis; dengan cache lama -> cache-lama', async () => {
  const BLOK = { [URLS.CPI]: resp('', false, 403), [URLS.NFP]: resp('', false, 403), [URLS.FED]: resp('', false, 403), [URLS.ICS]: resp('', false, 403) };
  const a = await syncKalender({ now: NOW, fetchFn: mkFetch(BLOK) });
  assert.equal(a.status, 'statis'); assert.equal(a.simpan, null); assert.ok(a.galat.length === 3 && /403/.test(a.galat[0]));
  const live = await syncKalender({ now: NOW - 2 * 864e5, fetchFn: mkFetch(LIVE) });
  const f = mkFetch({ ...BLOK, 'https://x.github.io/': resp(JSON.stringify(live.simpan)) });
  const b = await syncKalender({ now: NOW, fetchFn: f, cacheUrl: 'https://x.github.io/k.json' });
  assert.equal(b.status, 'cache-lama'); assert.equal(b.events.CPI.length, 4); assert.equal(b.simpan.t, NOW - 2 * 864e5);  // umur cache tidak diperbarui
});

test('sync: HTML BLS gagal tetapi ICS cadangan berhasil; Fed gagal -> sebagian', async () => {
  const s = await syncKalender({ now: NOW, fetchFn: mkFetch({ ...LIVE, [URLS.CPI]: resp('<html>diubah total</html>'), [URLS.NFP]: resp('', false, 403), [URLS.FED]: resp('', false, 503) }) });
  assert.equal(s.status, 'sebagian'); assert.equal(s.fontes.CPI.via, 'ics'); assert.equal(s.fontes.NFP.via, 'ics'); assert.equal(s.fontes.FOMC.ok, false);
  assert.ok(!s.events.FOMC && s.simpan.ok === false);
});

test('gabung: data resmi menggantikan statis (rapat Des 2027 hilang, strategi Okt terdeteksi, 2028 muncul)', async () => {
  const s = await syncKalender({ now: NOW, fetchFn: mkFetch(LIVE) });
  const stat = loadCalendar({ opex: false }, FILE).events, auto = loadCalendar({ opex: false }, FILE, s, NOW).events;
  assert.ok(!auto.some(e => e.id === 'fomc-2027-12-08') && !stat.some(e => e.id === 'fomc-2027-12-08'));
  assert.equal(auto.find(e => e.id === 'fomc-strategi-2027-10-27').impact, 'rendah');
  assert.ok(!auto.some(e => e.id === 'fomc-min-2027-11-17'));                                // rapat strategi 27 Okt tidak punya risalah keputusan
  assert.ok(auto.some(e => e.id === 'fomc-min-2027-12-08'));                                  // rapat 17 Nov punya risalah 8 Des
  assert.ok(auto.some(e => e.id === 'fomc-2028-01-26') && auto.some(e => e.id === 'cpi-2028-01-12') && auto.some(e => e.id === 'nfp-2028-01-07'));
  assert.ok(auto.some(e => e.id === 'cpi-2026-10-14'));                                       // riwayat sebelum tanggal pertama sumber tetap ada
  assert.ok(!auto.some(e => e.id === 'cpi-2027-02-11' && e.sumber === ''));                   // tanggal statis digantikan sumber resmi
  const ids = auto.map(e => e.id); assert.equal(new Set(ids).size, ids.length);
});

test('jadwal resmi bergeser -> tanggal statis lama ikut hilang', async () => {
  const geser = CPI.replace('Jan. 13, 2027', 'Jan. 14, 2027');
  const s = await syncKalender({ now: NOW, fetchFn: mkFetch({ ...LIVE, [URLS.CPI]: resp(geser) }) });
  const c = loadCalendar({ opex: false }, FILE, s, NOW).events;
  assert.ok(c.some(e => e.id === 'cpi-2027-01-14') && !c.some(e => e.id === 'cpi-2027-01-13'));
});

test('opex berlanjut otomatis sampai >=400 hari ke depan', () => {
  const c = loadCalendar({ opex: true }, FILE, null, Date.parse('2027-06-01T00:00:00Z')).events.filter(e => e.jenis.startsWith('OPEX'));
  assert.ok(Math.max(...c.map(e => e.t)) >= Date.parse('2028-06-01T00:00:00Z'));
});

test('peringatan status sinkron di macroLayer', async () => {
  const BLOK = { [URLS.CPI]: resp('', false, 403), [URLS.NFP]: resp('', false, 403), [URLS.FED]: resp('', false, 403), [URLS.ICS]: resp('', false, 403) };
  const bad = await syncKalender({ now: NOW, fetchFn: mkFetch(BLOK) });
  const r = macroLayer({ cfg: DEF, now: NOW, trades: [], file: FILE, auto: bad });
  const w = r.warnings.find(x => /Sinkron kalender otomatis gagal/.test(x.t));
  assert.ok(w && w.lvl === 'info');                                   // kalender statis masih >120 hari ke depan
  assert.equal(r.makro.sinkron.status, 'statis'); assert.ok(/Sinkron kalender: statis/.test(r.md));
  const ok = macroLayer({ cfg: DEF, now: NOW, trades: [], file: FILE, auto: await syncKalender({ now: NOW, fetchFn: mkFetch(LIVE) }) });
  assert.ok(!ok.warnings.some(x => /Sinkron kalender/.test(x.t))); assert.equal(ok.makro.sinkron.status, 'live');
  const late = macroLayer({ cfg: DEF, now: Date.parse('2027-11-01T00:00:00Z'), trades: [], file: FILE, auto: bad });
  assert.equal(late.warnings.find(x => /Sinkron kalender otomatis gagal/.test(x.t)).lvl, 'kuning');
});
