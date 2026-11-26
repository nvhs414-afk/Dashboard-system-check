import assert from 'node:assert/strict';
import test from 'node:test';
import { extractBillOfLadingFields } from '../src/bill-of-lading.js';
import { sourceType } from '../src/extraction.js';

function span(str, x, y, width = str.length * 4) {
  return { str, transform: [1, 0, 0, 1, x, y], width, height: 6 };
}

test('port labels read their own cells when the PDF lists labels before values', () => {
  const items = [
    span('Place of Receipt', 200, 100),
    span('Port of Discharge', 400, 100),
    span('Port of Loading', 200, 80),
    span('Place of Delivery', 400, 80),
    span('Inland Yard', 200, 91),
    span('Destination Port', 400, 90),
    span('Origin', 200, 71),
    span('Port', 228, 71),
    span('Inland Depot', 400, 70),
  ];
  assert.deepEqual(extractBillOfLadingFields(items), {
    blPol: 'Origin Port',
    blPod: 'Destination Port',
  });
});

test('an empty port cell does not read the neighboring column or the next form field', () => {
  assert.deepEqual(
    extractBillOfLadingFields([
      span('Port of Loading', 200, 100),
      span('Inland Depot', 400, 91),
      span('Place of Delivery', 200, 83),
      span('Other Port', 200, 74),
    ]),
    {},
  );
});

test('a Booking Notice mentioning a bill of lading stays out of the B/L group', () => {
  assert.equal(
    sourceType('REF1234.pdf', 'Booking Notice\nSee the Bill of Lading terms.'),
    'booking',
  );
});

test('party boxes and cargo columns supply names, identifiers, and gross kilograms', () => {
  const items = [
    span('Shipper/Exporter(complete name and address)', 20, 300),
    span('Booking No.', 290, 300),
    span('DEMO SHIPPER LTD.', 28, 290),
    span('(VN)', 30, 282),
    span('Factory Address', 28, 274),
    span('Consignee(complete name and address)', 20, 250),
    span('DEMO CONSIGNEE LLC', 28, 240),
    span('Gross Weight', 410, 120),
    span('Measurement', 510, 120),
    span('1,234.500', 450, 102),
    span('55.24', 550, 102),
    span('KGS', 470, 93),
    span('CBM', 560, 93),
    span('DEMU7654321', 20, 65),
    span('/', 100, 65),
    span('DEMO-SEAL01', 113, 65),
  ];
  assert.deepEqual(extractBillOfLadingFields(items), {
    blExporter: 'DEMO SHIPPER LTD. (VN)',
    blImporter: 'DEMO CONSIGNEE LLC',
    blContainer: 'DEMU7654321',
    blSeal: 'DEMO-SEAL01',
    blGross: '1234.5',
  });
});
