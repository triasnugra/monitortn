import test from 'node:test';
import assert from 'node:assert/strict';
import { etToMs, loadCalendar, macroLayer, inWindow, DEF } from '../scripts/makro.mjs';
const utc = ms => new Date(ms).toISOString().slice(0, 16);
const FILE = new URL('../data/events.json', import.meta.url).pathname;

test('ET -> UTC mengikuti DST AS', () => {
  assert.equal(utc(etToMs('2026-12-09 14:00')), '2026-12-09T19:00');   // EST
  assert.equal(utc(etToMs('2027-01-13 08:30')), '2027-01-13T13:30');   // EST (cocok dengan tabel CPI)
  assert.equal(utc(etToMs('2027-04-13 08:30')), '2027-04-13T12:30');   // EDT (DST mulai 14 Mar 2027)
  assert.equal(utc(etToMs('2027-11-10 08:30')), '2027-11-10T13:30');   // EST (DST berakhir 7 Nov 2027)
  assert.equal(utc(etToMs('2026-10-28 14:00')), '2026-10-28T18:00');   // EDT (DST berakhir 1 Nov 2026)
});

test('kalender: jenis, risalah FOMC, opsi Deribit', () => {
  const c = loadCalendar({ opex: true }, FILE), by = j => c.events.filter(e => e.jenis === j);
  assert.equal(by('FOMC').length, 9);
  assert.equal(by('FOMC-MINUTES').length, 9);                 // tidak ada risalah utk rapat tanpa keputusan
  assert.equal(utc(by('FOMC-MINUTES')[0].t), '2026-11-18T19:00'); // 28 Okt 2026 (EDT->EST: 14:00 ET = 19:00 UTC pada 18 Nov)
  assert.equal(utc(by('FOMC-MINUTES')[1].t), '2026-12-30T19:00');
  assert.equal(by('CPI').length, 15); assert.equal(by('NFP').length, 15);
  const ox = c.events.find(e => e.id === 'opex-2026-12-25');  // Jumat terakhir Des 2026
  assert.ok(ox && ox.jenis === 'OPEX-KUARTAL' && utc(ox.t) === '2026-12-25T08:00');
  assert.equal(c.events.find(e => e.id === 'opex-2026-11-27').jenis, 'OPEX');
  for (let i = 1; i < c.events.length; i++) assert.ok(c.events[i].t >= c.events[i - 1].t);
});

test('peringatan: merah dekat rilis, info jauh, tidak ada untuk yang lewat', () => {
  const now = Date.parse('2026-12-10T12:00Z');                 // CPI 13:30 UTC => 1,5 jam lagi
  const r = macroLayer({ cfg: DEF, now, trades: [], file: FILE });
  const cpi = r.warnings.find(w => /CPI AS/.test(w.t));
  assert.equal(cpi.lvl, 'merah');
  const far = macroLayer({ cfg: DEF, now: Date.parse('2026-12-06T00:00Z'), trades: [], file: FILE });
  assert.ok(far.warnings.some(w => /FOMC/.test(w.t) && w.lvl === 'info'));
  const after = macroLayer({ cfg: DEF, now: Date.parse('2026-12-10T23:00Z'), trades: [], file: FILE });
  assert.ok(!after.warnings.some(w => /CPI AS/.test(w.t)));    // 9,5 jam sesudah > jendela 8 jam
});

test('jendela & uji kelompok', () => {
  const cal = loadCalendar({ opex: false }, FILE), cpi = cal.events.find(e => e.id === 'cpi-2026-12-10');
  assert.ok(inWindow(cpi.t - 3 * 36e5, cpi, DEF)); assert.ok(!inWindow(cpi.t - 5 * 36e5, cpi, DEF));
  assert.ok(inWindow(cpi.t + 7 * 36e5, cpi, DEF)); assert.ok(!inWindow(cpi.t + 9 * 36e5, cpi, DEF));
  const trades = [{ t: cpi.t - 1 * 36e5, r: -1, tp: false }, { t: cpi.t + 36e5, r: -0.5, tp: false }, { t: cpi.t - 60 * 36e5, r: 1, tp: true }, { t: cpi.t - 1e3 * 36e5, r: null }];
  const r = macroLayer({ cfg: { ...DEF, opex: false }, now: Date.parse('2026-12-01T00:00Z'), trades, file: FILE });
  assert.equal(r.makro.uji.grup[0].n, 2); assert.equal(r.makro.uji.grup[1].n, 1);
  assert.ok(Math.abs(r.makro.uji.grup[0].r + 0.75) < 1e-9);
  assert.ok(/Uji jendela event/.test(r.md));
});

test('kalender habis memicu peringatan kuning; aktif=false diam', () => {
  const r = macroLayer({ cfg: DEF, now: Date.parse('2027-12-15T00:00Z'), trades: [], file: FILE });
  assert.ok(r.warnings.some(w => w.lvl === 'kuning' && /hampir habis/.test(w.t)));
  assert.deepEqual(macroLayer({ cfg: { aktif: false }, now: 0 }).warnings, []);
  const bad = macroLayer({ cfg: DEF, now: 0, file: '/tidak/ada.json' });
  assert.ok(bad.warnings.some(w => /tidak terbaca/.test(w.t)));
});
