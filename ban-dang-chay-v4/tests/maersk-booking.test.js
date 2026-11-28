import assert from 'node:assert/strict';
import test from 'node:test';
import { extractBillOfLadingFields } from '../src/bill-of-lading.js';
import { bookingFreeTime, resolveFreeTime } from '../src/booking-free-time.js';
import { readMaerskBooking } from '../src/maersk-booking.js';
import { billPartiesForBooking, state } from '../src/session.js';

const span = (str, x, y, width = str.length * 4) => ({
  str,
  transform: [1, 0, 0, 1, x, y],
  width,
  height: 8,
});
const columns = [30, 130, 235, 280, 370, 420, 500];
const row = (y, cells) => cells.flatMap((value, i) => (value ? [span(value, columns[i], y)] : []));

function bookingPages({ firstEta = '2026-09-13', secondEtd = '2026-09-11' } = {}) {
  return [
    [
      span('BOOKING', 345, 800),
      span('AMENDMENT', 379, 800),
      span('B', 30, 760),
      span('ooking', 34, 760),
      span('No.:', 61, 760),
      span('900123', 85, 760),
      span('Service Mode: CY/CY', 300, 740),
      span('From: Origin City,Vietnam', 300, 730),
      span('To: Oakland,California,United States', 300, 720),
      span('SERVICE QA9', 30, 520),
      span('Intended Transport Plan', 230, 388),
      ...row(372, ['From', 'To', 'Mode', 'Vessel', 'Voy. No.', 'ETD', 'ETA']),
      ...row(362, [
        'Origin Terminal',
        'Transit Port',
        'MVS',
        'SAMPLE ONE',
        '101N',
        '2026-09-08',
        firstEta,
      ]),
      ...row(352, ['', 'Transit Terminal']),
      ...row(341, [
        'Transit Port',
        'Destination Terminal',
        'MVS',
        'SAMPLE TWO',
        '102E',
        secondEtd,
        '2026-10-07',
      ]),
      ...row(331, ['Transit Terminal', 'Berth 58']),
      span('Load Itinerary', 267, 314),
      span('Empty Container', 30, 285),
      span('Sample Empty Depot', 100, 285),
      span('2026-08-24', 235, 285),
      span('00:00', 308, 285),
    ].reverse(),
    [
      span('QA1  Thu  Wed 02:00 PM  Tue 06:00 PM', 40, 715),
      span('QA9  Thu  Wed 03:00 PM  Tue 07:00 PM', 40, 705),
      span('*Other destinations : 12 hrs before CY Cut off', 30, 500),
      span(
        'Additional detention charge is applicable if the date exceeds the agreed contract deal or standard free time(7 calendar days',
        30,
        450,
      ),
      span('including Empty pick up date + Load date).', 30, 440),
      span('Combined Demurrage Detention tarriff is available', 30, 420),
    ].reverse(),
  ];
}

test('read a Booking Amendment by PDF row and column regardless of text stream order', () => {
  const { fields, text } = readMaerskBooking(bookingPages());
  assert.deepEqual(fields, {
    bookingNo: '900123',
    bookingReceipt: 'Origin City, Vietnam',
    bookingPol: 'Origin City',
    bookingPolTml: 'Origin Terminal',
    bookingDischarge: 'Oakland',
    bookingDischargeTml: 'Destination Terminal Berth 58',
    bookingPod: 'Oakland, California, United States',
    bookingPodTml: 'Destination Terminal Berth 58',
    etd: '2026-09-08',
    etdConnect: '2026-09-11',
    etaFirst: '2026-09-13',
    etaSecond: '2026-10-07',
    cyCutoff: 'Wed 03:00 PM (lịch tham chiếu QA9)',
    icdCutoff: 'Tue 07:00 PM (lịch tham chiếu QA9)',
    siCutoff: '12 hrs before CY Cut off',
    bookingPickupCy: 'Sample Empty Depot',
    pickupDate: '2026-08-24 00:00',
  });
  const evidence = bookingFreeTime(text);
  const standard = evidence.find((entry) => entry.field === 'standardDet');
  assert.equal(standard?.page, 2);
  assert.equal(standard?.value, '7');
  assert.match(standard.quote, /Load date/);
  assert.equal(
    evidence.some((entry) => entry.field === 'tariff'),
    true,
  );
  assert.deepEqual(resolveFreeTime(evidence), { detFree: '7' });
});

test('keep the leg number when one date is missing and omit a repeated departure', () => {
  const { fields } = readMaerskBooking(bookingPages({ firstEta: '', secondEtd: '2026-09-08' }));
  assert.equal(fields.etd, '2026-09-08');
  assert.equal(fields.etdConnect, undefined);
  assert.equal(fields.etaFirst, undefined);
  assert.equal(fields.etaSecond, '2026-10-07');
  assert.equal(readMaerskBooking([[span('BOOKING NOTICE', 30, 800)]]), undefined);
});

test('use explicitly matching waybill parties and skip a wrapped consignee qualifier', (t) => {
  const first = extractBillOfLadingFields([
    span('Shipper', 35, 760),
    span('Booking No.', 301, 760),
    span('SAMPLE SELL', 35, 750),
    span('ER LTD', 79, 750),
    span('900123', 301, 750),
    span('Consignee (Negotiable only if', 35, 705),
    span('consigned to a named party)', 35, 698),
    span('SAMPLE BUYER LLC', 35, 691),
  ]);
  assert.equal(first.blBookingNo, '900123');
  assert.equal(first.blExporter, 'SAMPLE SELLER LTD');
  assert.equal(first.blImporter, 'SAMPLE BUYER LLC');
  const original = { queue: state.queue, form: state.form, manual: state.manual };
  t.after(() => Object.assign(state, original));
  const source = (fields) => ({ type: 'bl', status: 'Đã nhận diện', fields });
  state.form = { bookingNo: '900123' };
  state.manual = new Set();
  state.queue = [source(first), source({ blBookingNo: '900124', blImporter: 'UNRELATED' })];
  assert.deepEqual(billPartiesForBooking(), {
    bookingShipper: 'SAMPLE SELLER LTD',
    bookingConsignee: 'SAMPLE BUYER LLC',
  });
  state.manual.add('bookingShipper');
  state.queue.push(source({ blBookingNo: '900123', blImporter: 'CONFLICTING' }));
  assert.deepEqual(billPartiesForBooking(), { bookingShipper: '', bookingConsignee: '' });
});
