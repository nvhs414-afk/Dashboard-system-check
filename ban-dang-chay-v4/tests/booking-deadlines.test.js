import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingDeadlineWarnings } from '../src/booking-deadlines.js';
import { bookingFreeTime } from '../src/booking-free-time.js';
import { extractFields } from '../src/extraction.js';

const lot = {
  pickupDate: '2026/03/30 11:00',
  cyCutoff: '2026/04/01 13:00',
  etd: '2026/04/03 12:30',
  detFree: '6',
  demFree: '7',
};
const warnings = (fields, now, evidence) =>
  bookingDeadlineWarnings((key) => fields[key] || '', evidence, Date.parse(now));

test('DET and DEM alert exactly 24 hours before their separate Vietnam deadlines', () => {
  const justBefore = warnings(lot, '2026-04-03T23:59:00+07:00');
  assert.equal(justBefore.det.status, 'normal');
  const detWindow = warnings(lot, '2026-04-04T00:00:00+07:00');
  assert.equal(detWindow.det.status, 'warning');
  assert.equal(detWindow.det.message, 'Còn 24 giờ đến hạn DET');
  assert.equal(detWindow.det.deadline, '05/04/2026 00:00');
  assert.equal(detWindow.det.reminder, '04/04/2026 00:00');
  assert.equal(detWindow.dem.status, 'normal');
  assert.match(detWindow.dem.detail, /CY cut-off/);
  const demWindow = warnings(lot, '2026-04-07T00:00:00+07:00');
  assert.equal(demWindow.det.status, 'alert');
  assert.equal(demWindow.dem.status, 'warning');
  assert.equal(demWindow.dem.deadline, '08/04/2026 00:00');
  assert.equal(demWindow.dem.reminder, '07/04/2026 00:00');
  assert.equal(warnings(lot, '2026-04-08T00:00:00+07:00').dem.status, 'alert');
  assert.match(demWindow.sailing.message, /Chưa có ATD/);
  assert.match(demWindow.sailing.detail, /DET 0 ngày.*DEM 0 ngày/);
});

test('actual gate-in closes DET and actual departure provides an early or late comparison', () => {
  const actual = {
    bookingPickupActual: '30/03/2026 10:30',
    bookingGateInActual: '2026-04-06T09:00',
  };
  const late = warnings(
    { ...lot, ...actual, bookingAtd: '2026/04/14 09:00' },
    '2026-04-15T00:00:00+07:00',
  );
  assert.equal(late.det.excess, 2);
  assert.equal(late.dem.excess, 2);
  assert.match(late.det.detail, /thực tế/);
  assert.equal(late.sailing.status, 'alert');
  assert.match(late.sailing.message, /trễ hơn ETD 260 giờ 30 phút/);
  assert.match(late.sailing.detail, /DET 2 ngày.*DEM 2 ngày/);

  const early = warnings(
    { ...lot, bookingGateInActual: '2026/04/01 11:00', bookingAtd: '2026/04/03 11:30' },
    '2026-04-14T00:00:00+07:00',
  );
  assert.equal(early.det.status, 'normal');
  assert.equal(early.dem.status, 'normal');
  assert.match(early.sailing.message, /sớm hơn ETD 1 giờ/);
  const dateOnly = warnings({ ...lot, bookingAtd: '03/04/2026' }, '2026-04-14T00:00:00+07:00');
  assert.match(dateOnly.sailing.message, /cùng ngày/);
});

test('estimates distinguish a late planned ETD from an actual delay', () => {
  const projected = warnings({ ...lot, etd: '2026/04/09 12:30' }, '2026-04-02T00:00:00+07:00');
  assert.equal(projected.sailing.status, 'alert');
  assert.match(projected.sailing.message, /Chưa có ATD/);
  assert.match(projected.sailing.detail, /DET 0 ngày.*DEM 2 ngày/);
  const missingGate = warnings({ ...lot, cyCutoff: '' }, '2026-04-04T00:00:00+07:00');
  assert.equal(missingGate.det.status, 'warning');
  assert.equal(missingGate.dem.status, 'pending');
  assert.match(missingGate.sailing.detail, /DET cần xác nhận.*DEM cần xác nhận/);
});

test('combined terms use one allowance, and working days or invalid dates stay pending', () => {
  const now = '2026-04-05T00:00:00+07:00';
  const combined = warnings(
    { ...lot, detFree: '', demFree: '', freeDays: '7', etd: '2026/04/06' },
    now,
  );
  assert.equal(combined.det.status, 'warning');
  assert.equal(combined.dem.deadline, '06/04/2026 00:00');
  assert.match(combined.sailing.detail, /DEM\/DET gộp 1 ngày/);
  assert.equal(warnings({ ...lot, freeDays: '7' }, now).dem.status, 'pending');
  const working = bookingFreeTime('DET: 6 business days. DEM: 7 calendar days.');
  assert.equal(warnings(lot, now, working).det.status, 'pending');
  assert.equal(warnings(lot, now, working).dem.status, 'normal');
  assert.equal(warnings({ ...lot, pickupDate: '2026/02/30 11:00' }, now).det.status, 'pending');
  assert.equal(warnings({ ...lot, bookingGateInActual: '2026/04/04' }, now).dem.status, 'pending');
});

test('Booking extracts operational dates only from their corresponding labels', () => {
  const values = extractFields(
    'booking',
    [
      'Booking Notice',
      'Booking Number: DEMO123',
      'ETD: 2026/04/03 12:30',
      'Estimated Empty Pick-up Date: 2026/03/30 11:00',
      'Actual Empty Pick-up Date: 30/03/2026 09:00',
      'Actual Gate-in Date/Time: 2026/04/02 08:15',
      'Estimated Gate-In: 2026/04/01 13:00',
      'Actual Time of Departure (ATD): 2026/04/04 10:00',
    ].join('\n'),
  );
  assert.equal(values.etd, '2026/04/03 12:30');
  assert.equal(values.bookingPickupActual, '30/03/2026 09:00');
  assert.equal(values.bookingGateInPlanned, '2026/04/01 13:00');
  assert.equal(values.bookingGateInActual, '2026/04/02 08:15');
  assert.equal(values.bookingAtd, '2026/04/04 10:00');
});

test('standard DET through load date uses ETD as an estimate even after gate-in', () => {
  const evidence = bookingFreeTime(
    'The additional detention charge applies after standard free time (7 calendar days including empty pick up date + Load date).',
  );
  const result = warnings(
    {
      ...lot,
      pickupDate: '2026/04/01',
      detFree: '7',
      demFree: '',
      etd: '2026/04/09',
      bookingGateInActual: '2026/04/04',
    },
    '2026-04-07T00:00:00+07:00',
    evidence,
  );
  assert.equal(result.det.deadline, '08/04/2026 00:00');
  assert.equal(result.det.status, 'warning');
  assert.equal(result.det.excess, 2);
  assert.match(result.det.detail, /ngày xếp tàu.*ETD/);
  assert.equal(result.dem.status, 'pending');
});
