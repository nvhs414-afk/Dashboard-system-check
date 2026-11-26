import assert from 'node:assert/strict';
import test from 'node:test';
import { extractFields } from '../src/extraction.js';
import { evaluateShipment } from '../src/checks.js';
import { extractPackingSheet } from '../src/packing-sheet.js';

test('booking reads both terminal fields and dates from an HMM-style notice', () => {
  const text = [
    'Port of Loading : SAMPLE ORIGIN, TML : SAMPLE TERMINAL Facility Code : XX000000',
    'ETB : 2026/04/02 18:30 ETD : 2026/04/03 12:30',
    '2nd Vessel/Voyage : T/S Port : Call Sign :',
    'Port of Discharging : SAMPLE CITY, CA(USSMP) TML : SAMPLE PIER ETA : 2026/04/26 05:00',
    'PKG-Count : 0 Gross WGT : 10,000.000 KGS Measurement : 0',
    'Estimated Empty Pick-up Date (for reference) : 2026/03/30 11:00',
    'Cargo Cut-off (Terminal Facility) (DC) 2026/04/01 13:00 Cargo Cut-off (Return Facility) 2026/04/02 09:00',
    'SI General Cut-off 2026/03/31 09:00 VGM Cut-off 2026/03/31 10:00',
  ].join('\n');
  const fields = extractFields('booking', text);
  assert.equal(fields.bookingPol, 'SAMPLE ORIGIN · SAMPLE TERMINAL');
  assert.equal(fields.bookingPod, 'SAMPLE CITY, CA (USSMP) · SAMPLE PIER');
  assert.equal(fields.etd, '2026/04/03 12:30');
  assert.equal(fields.etaFirst, '2026/04/26 05:00');
  assert.equal(fields.pickupDate, '2026/03/30 11:00');
  assert.equal(fields.cyCutoff, '2026/04/01 13:00');
  assert.equal(fields.siCutoff, '2026/03/31 09:00');
  assert.equal(fields.plannedWeight, '10,000.000');
});

test('weight checks use the shared invoice value and ignore formatting differences', () => {
  const { plGross } = extractPackingSheet([
    ['Packing List'],
    ['Item', 'Gross Weight (KGS)'],
    ['TOTAL', 'KGS 1,234.50'],
  ]);
  assert.equal(plGross, '1,234.50');
  const queue = ['invoice', 'packing', 'booking', 'bl'].map((type) => ({
    type,
    status: 'Đã nhận diện',
  }));
  const fields = {
    plGross,
    blGross: '1,234.500',
    bookingPol: 'SAMPLE ORIGIN · SAMPLE TERMINAL',
    blPol: 'SAMPLE ORIGIN, VIETNAM',
    bookingPod: 'SAMPLE CITY, CA (USSMP) · SAMPLE PIER',
    blPod: 'SAMPLE CITY, CA',
  };
  const value = (key) => fields[key] || '';
  const result = evaluateShipment(queue, value, { packingGross: plGross });
  const check = (name) => result.checks.find(({ title }) => title === name);
  assert.equal(check('CI ↔ PL · Gross Weight').status, 'pass');
  assert.match(check('CI ↔ PL · Gross Weight').detail, /lấy từ Packing List/);
  assert.equal(check('PL ↔ B/L · Gross Weight').status, 'pass');
  assert.equal(check('Booking ↔ B/L · POL').status, 'pass');
  assert.equal(check('Booking ↔ B/L · POD').status, 'pass');
  fields.invoiceGross = '1,300.000';
  assert.equal(
    evaluateShipment(queue, value).checks.find(({ title }) => title === 'CI ↔ PL · Gross Weight')
      .status,
    'fail',
  );
});
