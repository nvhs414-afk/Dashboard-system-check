import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateShipment } from '../src/checks.js';
import { extractFields, isOutOfScopeFilename, sourceType } from '../src/extraction.js';
import { recognizeDocument } from '../src/document-recognition.js';
import { pdfDocuments } from '../src/pdf-documents.js';
import { bookingIssueDate, selectBookingSources } from '../src/booking-revisions.js';

test('document headings take precedence over filenames and secondary references', () => {
  assert.equal(sourceType('invoice.pdf', 'Packing List\nInvoice No: X123\nQuantity'), 'packing');
  assert.equal(
    sourceType('invoice.pdf', 'Customs Declaration\nInvoice\nInvoice No: X123'),
    'other',
  );
  assert.equal(recognizeDocument('booking.pdf', 'See the Booking terms.').status, 'review');
});

test('an uploaded PDF separates different documents and retains continuation pages', () => {
  const texts = [
    'Booking Notice\nBooking No: BK100',
    'Continuation of special conditions',
    'Non-Negotiable Waybill\nB/L No: BL100',
    'Non-Negotiable Waybill\nB/L No: BL200',
  ];
  const pages = texts.map((text, index) => ({
    number: index + 1,
    text,
    native: [],
    recognized: [],
  }));
  const documents = pdfDocuments('merged.pdf', pages);
  assert.deepEqual(
    documents.map((doc) => [doc.recognition.type, doc.pages.map((page) => page.number)]),
    [
      ['booking', [1, 2]],
      ['bl', [3]],
      ['bl', [4]],
    ],
  );
});

test('Booking selects a clearly newer revision of the same reference', () => {
  const source = (number, date, etd) => ({
    type: 'booking',
    status: 'Đã nhận diện',
    fields: { bookingNo: number, bookingIssuedAt: bookingIssueDate('Print Date: ' + date), etd },
  });
  const original = source('BK100', '2026/03/27 12:00', '2026/04/02');
  const amendment = source('BK100', '2026/03/30 08:30', '2026/04/03');
  const selected = selectBookingSources([original, amendment]);
  assert.deepEqual(selected.sources, [amendment]);
  assert.ok(selected.changed.includes('etd'));
  assert.ok(selectBookingSources([amendment, source('BK200', '2026/03/30', '')]).mixed);
  assert.ok(
    selectBookingSources([original, source('BK100', 'invalid', '2026/04/03')]).conflicts.includes(
      'etd',
    ),
  );
});

test('a declaration workbook is skipped, even when it contains an invoice reference', () => {
  assert.equal(isOutOfScopeFilename('ToKhaiHQ7X_QDTQ_12345.xls'), true);
  const text = 'Tờ khai hàng hóa xuất khẩu\nCommercial Invoice No.: INV-123';
  assert.equal(sourceType('TKX', text), 'other');
  assert.deepEqual(extractFields('customs', text), {});
});

test('contract sheets and customs sources stay excluded despite strong invoice keywords', () => {
  const invoiceSignals = 'Invoice No: INV-123\nUnit Price\nAmount USD\nFOB\nInvoice Date';
  const customs = recognizeDocument('ToKhaiHQ7X_QDTQ_12345.xls', invoiceSignals);
  assert.equal(customs.status, 'excluded');
  assert.equal(customs.reason, 'Tờ khai hải quan.');
  assert.equal(recognizeDocument('DSContainer 12345.pdf', invoiceSignals).status, 'excluded');
  const contract = recognizeDocument('commercial.xlsx', 'PURCHASE CONTRACT\n' + invoiceSignals);
  assert.equal(contract.status, 'excluded');
  assert.equal(contract.reason, 'Hợp đồng mua bán.');
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
  assert.equal(
    actual.checks.some(({ title }) => /tờ khai|phân luồng/i.test(title)),
    false,
  );
});

test('Net Weight extracted from documents does not affect the comparison or risk score', () => {
  const queue = ['invoice', 'packing', 'booking'].map((type) => ({
    type,
    status: 'Đã nhận diện',
  }));
  const visibleValues = { invoiceGross: '5,896.40', plGross: '5,896.400' };
  const baseline = evaluateShipment(queue, (key) => visibleValues[key] || '');

  for (const netValues of [{ plNet: '4,450.40' }, { plNet: '4,450.40', invoiceNet: '4,850.40' }]) {
    const values = { ...visibleValues, ...netValues };
    const { checks, draft, score } = evaluateShipment(queue, (key) => values[key] || '');
    assert.deepEqual(checks, baseline.checks);
    assert.equal(score, baseline.score);
    assert.deepEqual(draft.kiemTra, baseline.checks);
    assert.ok(
      checks.some(({ title, status }) => title === 'CI ↔ PL · Gross Weight' && status === 'pass'),
    );
  }
});
