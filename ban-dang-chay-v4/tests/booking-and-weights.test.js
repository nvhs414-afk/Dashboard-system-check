import assert from 'node:assert/strict';
import test from 'node:test';
import { extractFields } from '../src/extraction.js';
import { evaluateShipment } from '../src/checks.js';
import { extractPackingSheet } from '../src/packing-sheet.js';

test('booking reads both terminal fields and dates from an HMM-style notice', () => {
  const text = [
    'Shipping Information',
    'Place of Receipt : SAMPLE RECEIPT Trans Mode : Barge (Origin)',
    'Port of Loading : SAMPLE ORIGIN, TML : SAMPLE TERMINAL Facility Code : XX000000',
    'ETB : 2026/04/02 18:30 ETD : 2026/04/03 12:30',
    '2nd Vessel/Voyage : T/S Port : Call Sign :',
    'Port of Discharging : SAMPLE CITY, CA(USSMP) TML : SAMPLE PIER ETA : 2026/04/26 05:00',
    'Place of Delivery : SAMPLE DELIVERY TML : SAMPLE DEPOT ETA : 26/04/2026 5:00',
    'Cargo Information',
    'PKG-Count : 0 Gross WGT : 10,000.000 KGS Measurement : 0',
    'Final Weight: 7,872.000 KGS',
    'Empty Pick-up CY : DEMO CONTAINER TERMINAL Estimated Empty Pick-up Date (for reference) : 2026/03/30 11:00',
    'Cargo Cut-off (Terminal Facility) (DC) 2026/04/01 13:00 Cargo Cut-off (Return Facility) 2026/04/02 09:00',
    'SI General Cut-off 2026/03/31 09:00 VGM Cut-off 2026/03/31 10:00',
  ].join('\n');
  const fields = extractFields('booking', text);
  assert.equal(fields.bookingReceipt, 'SAMPLE RECEIPT');
  assert.equal(fields.bookingReceiptTml, undefined);
  assert.equal(fields.bookingPol, 'SAMPLE ORIGIN');
  assert.equal(fields.bookingPolTml, 'SAMPLE TERMINAL');
  assert.equal(fields.bookingDischarge, 'SAMPLE CITY, CA (USSMP)');
  assert.equal(fields.bookingDischargeTml, 'SAMPLE PIER');
  assert.equal(fields.bookingPod, 'SAMPLE DELIVERY');
  assert.equal(fields.bookingPodTml, 'SAMPLE DEPOT');
  assert.equal(fields.etd, '2026/04/03 12:30');
  assert.equal(fields.etaFirst, '2026/04/26 05:00');
  assert.equal(fields.etdConnect, undefined);
  assert.equal(fields.etaSecond, undefined);
  assert.equal(fields.pickupDate, '2026/03/30 11:00');
  assert.equal(fields.bookingPickupCy, 'DEMO CONTAINER TERMINAL');
  assert.equal(fields.cyCutoff, '2026/04/01 13:00');
  assert.equal(fields.siCutoff, '2026/03/31 09:00');
  assert.equal(fields.plannedWeight, undefined);
  assert.equal(fields.finalWeight, undefined);
});

test('Booking keeps pickup and return sites separate and accepts a wrapped pickup site', () => {
  const fields = extractFields(
    'booking',
    'Empty Pickup CY:\nSAMPLE CONTAINER YARD\nFull Return CY: RETURN TERMINAL',
  );
  assert.equal(fields.bookingPickupCy, 'SAMPLE CONTAINER YARD');
  assert.equal(
    extractFields('booking', 'Empty Pick-up CY:\nFull Return CY: RETURN TERMINAL').bookingPickupCy,
    undefined,
  );
});

test('a two-leg schedule respects explicit labels and matching dates appear once', () => {
  const text = [
    'Booking Information',
    'ETD chặng 2: 2026/04/12 16:00',
    'ETD chặng 1: 2026/04/12 08:00',
    'ETA Leg 1: 2026/04/12 12:15',
    'ETA Leg 2: 2026/04/26 05:00',
    'Place of Receipt: DEMO ORIGIN',
    'TML: DEMO ORIGIN TERMINAL Trans Mode: Truck',
  ].join('\n');
  const fields = extractFields('booking', text);
  assert.equal(fields.etd, '2026/04/12 08:00');
  assert.equal(fields.etdConnect, '2026/04/12 16:00');
  assert.equal(fields.etaFirst, '2026/04/12 12:15');
  assert.equal(fields.etaSecond, '2026/04/26 05:00');
  assert.equal(fields.bookingReceipt, 'DEMO ORIGIN');
  assert.equal(fields.bookingReceiptTml, undefined);
  const duplicate = text.replace('2026/04/26 05:00', '12-04-2026 12:15');
  assert.equal(extractFields('booking', duplicate).etaSecond, undefined);
});

test('a connecting sailing does not use the destination ETA as the first arrival', () => {
  const text = [
    'Shipping Information',
    '2nd Vessel/Voyage: SAMPLE 05 T/S Port: SAMPLE TRANSFER',
    'Port of Discharging: SAMPLE CITY ETA: 2026/04/26 05:00',
    'Place of Delivery: SAMPLE DEPOT ETA: 2026/04/27 09:00',
  ].join('\n');
  const fields = extractFields('booking', text);
  assert.equal(fields.etaFirst, undefined);
  assert.equal(fields.etaSecond, '2026/04/26 05:00');
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
    bookingDischarge: 'SAMPLE CITY, CA (USSMP)',
    bookingPod: 'INLAND DEPOT',
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

test('quantity and unit checks use the same Packing List unit shown in the invoice', () => {
  const queue = ['invoice', 'packing'].map((type) => ({ type, status: 'Đã nhận diện' }));
  const fields = { invoiceQty: '142', invoiceUnit: 'PCS', plQty: '142', plUnit: 'PCS/SET' };
  const value = (key) => fields[key] || '';
  const reviewed = evaluateShipment(queue, value, { packingUnit: 'PCS/SET' });
  assert.equal(reviewed.draft.soLuong, '142 PCS/SET');
  const find = (title) => reviewed.checks.find((check) => check.title === title);
  assert.equal(find('CI ↔ PL · Số lượng').status, 'pass');
  const unitCheck = find('CI ↔ PL · Đơn vị');
  assert.equal(unitCheck.status, 'pass');
  assert.match(unitCheck.detail, /Nguồn 1: PCS\/SET · Nguồn 2: PCS\/SET/);
  assert.equal(find('CI ↔ PL · Số lượng và đơn vị'), undefined);
  const independent = evaluateShipment(queue, value);
  assert.equal(
    independent.checks.find(({ title }) => title === 'CI ↔ PL · Số lượng và đơn vị').status,
    'expected',
  );
});
