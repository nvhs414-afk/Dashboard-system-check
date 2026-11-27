import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingFreeTime, resolveFreeTime } from '../src/booking-free-time.js';
import { makeRadar } from '../src/booking-radar.js';
import { extractFields } from '../src/extraction.js';

test('Booking reads separately stated DEM and DET, including across a wrapped line', () => {
  const text = [
    '[Trang 1]',
    'Equipment Type : Dry Container Equipment Size : 4H',
    'RF : No DG : No',
    '[Trang 2]',
    'Remarks: Free 6DET +',
    '7DEM for DC-general cargo. Free 7DET + 5DEM for Reefer.',
    'Free 5DET+5DEM for Dry-DG, RD, FR, OT.',
  ].join('\n');
  const evidence = bookingFreeTime(text);
  assert.deepEqual(resolveFreeTime(evidence), { demFree: '7', detFree: '6' });
  assert.ok(
    evidence.some(
      (entry) => entry.page === 2 && entry.applicable && /DC-general/.test(entry.quote),
    ),
  );
  assert.ok(evidence.some((entry) => !entry.applicable && /Reefer/.test(entry.quote)));
  const fields = extractFields('booking', text);
  assert.equal(fields.demFree, '7');
  assert.equal(fields.detFree, '6');
  assert.equal(fields.freeDays, undefined);

  const radar = makeRadar(
    (key) =>
      ({ ...fields, bookingNo: 'DEMOBOOKING', pickupDate: '2026/04/01', etd: '2026/04/20' })[key] ||
      '',
  );
  assert.match(
    radar.lines.find(({ title }) => title.includes('Free time')).detail,
    /Free DEM 7 ngày · Free DET 6 ngày/,
  );
  assert.equal(
    radar.checks.some(({ title }) => /DEM\/DET/.test(title)),
    false,
  );
});

test('explicit combined days fill only the combined field', () => {
  for (const text of ['Combined D&D 14 calendar days', 'DET + DEM (Free time): 14 days']) {
    assert.deepEqual(resolveFreeTime(bookingFreeTime(text)), { freeDays: '14' });
  }
  assert.deepEqual(resolveFreeTime(bookingFreeTime('DEM: 5 days, DET: 7 days')), {
    demFree: '5',
    detFree: '7',
  });
  assert.deepEqual(resolveFreeTime(bookingFreeTime('Free time: 7 days free demurrage')), {
    demFree: '7',
  });
});

test('ambiguous terms and contradictions keep the relevant fields pending', () => {
  const text = 'DEM: 5 days. Free DEM: 6 days. DET: 7 days.';
  assert.deepEqual(resolveFreeTime(bookingFreeTime(text)), { detFree: '7' });
  const tariff = bookingFreeTime("D&D as per carrier's tariff");
  assert.equal(tariff[0].field, 'tariff');
  assert.deepEqual(resolveFreeTime(tariff), {});
  for (const text of [
    'DEM/DET 5+7',
    'Free time: 7/7',
    'Storage free at CFS: 5 days',
    'Terms: FIOS',
  ]) {
    assert.deepEqual(resolveFreeTime(bookingFreeTime(text)), {});
  }
  assert.deepEqual(resolveFreeTime(bookingFreeTime('Free 6DET + 7DEM for DC-general cargo')), {});
});
