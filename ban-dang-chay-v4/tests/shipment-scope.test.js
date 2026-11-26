import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateShipment } from '../src/checks.js';
import { extractFields, isOutOfScopeFilename, sourceType } from '../src/extraction.js';

test('a declaration workbook is skipped, even when it contains an invoice reference', () => {
  assert.equal(isOutOfScopeFilename('ToKhaiHQ7X_QDTQ_12345.xls'), true);
  const text = 'Tờ khai hàng hóa xuất khẩu\nCommercial Invoice No.: INV-123';
  assert.equal(sourceType('TKX', text), 'other');
  assert.deepEqual(extractFields('customs', text), {});
});

test('declaration status, fields and missing documents do not affect comparison or draft', () => {
  const queue = ['invoice', 'packing', 'booking', 'bl'].map((type) => ({
    type,
    status: 'Đã nhận diện',
  }));
  const fields = { invoiceNo: 'TEST-123', plInvoiceNo: 'TEST-123' };
  const value = (key) => fields[key] || '';
  const expected = evaluateShipment(queue, value);
  const actual = evaluateShipment(
    [...queue, { type: 'customs', status: 'Đã nhận diện' }],
    (key) => ({ decNo: '987654', decChannel: 'red', decInvoiceNo: 'DIFFERENT' })[key] || value(key),
  );
  assert.deepEqual(actual, expected);
  assert.equal(Object.hasOwn(actual.draft, 'soToKhai'), false);
  assert.equal(actual.checks.some(({ title }) => /tờ khai|phân luồng/i.test(title)), false);
});
