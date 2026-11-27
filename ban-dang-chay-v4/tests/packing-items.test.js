import assert from 'node:assert/strict';
import test from 'node:test';
import { extractFields } from '../src/extraction.js';

const sheet = (rows) => extractFields('packing', 'Packing List', rows);

test('the packing item list reads the line totals under a merged quantity heading', () => {
  const header = [
    "CTN'S",
    'Item',
    '',
    'Description of goods',
    'Size',
    'Quantity\n(PCS/SET)',
    '',
    'Gross Weight (KGS)',
  ];
  const fields = sheet([
    ['PACKING LIST'],
    header,
    ['', '', '', 'FURNITURE'],
    ['4', 'DEMO-01', '', 'SIDE TABLE', '10 x 20 mm', '1', '4'],
    ['', 'Page Total', '', '', '', '4'],
    header,
    ['6', 'DEMO-02', '', 'WOOD\nCHAIR', '30 x 40 mm', '1', '6'],
    ['10', 'TOTAL', '', '', '', '10', '', 'KGS 200.00'],
  ]);
  assert.equal(
    fields.plItems,
    'DEMO-01 - SIDE TABLE - 10 x 20 mm - 4\nDEMO-02 - WOOD CHAIR - 30 x 40 mm - 6',
  );
  assert.equal(fields.plQty, '10');
  assert.equal(fields.plGross, '200.00');
});

test('item columns can be reordered and a sheet can omit the grand total', () => {
  const fields = sheet([
    ['PACKING LIST'],
    ['Quantity (PCS)', 'SKU', 'Description of goods', 'Size'],
    ['12', 'DEMO-03', 'BOOKCASE', '100 x 400 mm'],
    ['3', 'DEMO-04', 'CABINET'],
    ['2', '', 'SHELF', '100 x 100 mm'],
  ]);
  assert.equal(
    fields.plItems,
    'DEMO-03 - BOOKCASE - 100 x 400 mm - 12\nDEMO-04 - CABINET - — - 3\n— - SHELF - 100 x 100 mm - 2',
  );
});
