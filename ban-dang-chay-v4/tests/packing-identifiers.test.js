import assert from 'node:assert/strict';
import test from 'node:test';
import { extractFields } from '../src/extraction.js';
import { resolvePackingIdentifiers } from '../src/packing-identifiers.js';
import { billIdentifiersForPacking, state } from '../src/session.js';

const item = (type, fields) => ({ type, status: 'Đã nhận diện', fields });
const packing = (fields) => item('packing', { plInvoiceNo: 'INV-001', ...fields });
const bill = (fields) =>
  item('bl', {
    blBillNo: 'BL100',
    blContainer: 'TSTU1234567',
    blSeal: 'TEST-1234',
    ...fields,
  });

test('the PL uses a matching waybill even when an unrelated bill is uploaded first', () => {
  const pl = packing({ plBillNo: 'bl100' });
  const source = bill();
  state.queue = [bill({ blBillNo: 'BL200', blSeal: 'OTHER-222' }), pl, source];
  state.form = { plInvoiceNo: 'INV-001' };
  state.manual.clear();
  assert.deepEqual(billIdentifiersForPacking(), {
    plContainer: { value: 'TSTU1234567', item: source },
    plSeal: { value: 'TEST-1234', item: source },
    reference: 'BL100',
  });
  state.manual.add('plContainer');
  assert.equal(billIdentifiersForPacking().plContainer, undefined);
  assert.equal(billIdentifiersForPacking().plSeal.value, 'TEST-1234');
  state.manual.clear();
});

test('a PO links PL only to a unique explicit waybill number', () => {
  const pl = packing({ plPurchaseOrder: 'PO-123' });
  const source = bill({ blPurchaseOrder: 'PO-123' });
  assert.equal(resolvePackingIdentifiers([pl, source], pl).plSeal.value, 'TEST-1234');
  assert.ok(resolvePackingIdentifiers([pl, bill()], pl).reason);
  assert.ok(
    resolvePackingIdentifiers(
      [
        pl,
        source,
        bill({
          blBillNo: 'BL200',
          blPurchaseOrder: 'PO-123',
        }),
      ],
      pl,
    ).reason,
  );
  const conflicting = packing({ plBillNo: 'BL200', plPurchaseOrder: 'PO-123' });
  assert.equal(
    resolvePackingIdentifiers([conflicting, source], conflicting).plContainer,
    undefined,
  );
});

test('Booking can supply missing identifiers when it is tied to the same waybill', () => {
  const pl = packing({ plBillNo: 'BL100', plContainer: 'TSTU1234567' });
  const source = bill({ blSeal: '', blBookingNo: 'BKG123' });
  const booking = item('booking', {
    bookingNo: 'BKG123',
    bookingContainer: 'TSTU1234567',
    bookingSeal: 'BOOK-123',
  });
  const linked = resolvePackingIdentifiers([pl, source, booking], pl);
  assert.deepEqual(linked.plSeal, { value: 'BOOK-123', item: booking });
  assert.equal(linked.plContainer, undefined);
  assert.equal(resolvePackingIdentifiers([pl, booking], pl).plSeal, undefined);
  const mismatched = item('booking', { ...booking.fields, bookingBillNo: 'BL200' });
  assert.equal(resolvePackingIdentifiers([pl, source, mismatched], pl).plSeal, undefined);
  assert.ok(
    resolvePackingIdentifiers([pl, source, bill({ blContainer: 'TSTU7654321' })], pl).reason,
  );
});

test('the cargo table supplies identifiers and the bill records explicit references', () => {
  const fields = extractFields(
    'bl',
    [
      'NON-NEGOTIABLE WAYBILL',
      'Booking No.  275383783   B/L No.  275383783',
      'Container: Protect',
      'TCNU1663410  ML-VN1843878  40 DRY  116 CARTONS',
      'AS PER PO.# : PO-0004229784',
    ].join('\n'),
  );
  assert.equal(fields.blContainer, 'TCNU1663410');
  assert.equal(fields.blSeal, 'ML-VN1843878');
  assert.equal(fields.blBillNo, '275383783');
  assert.equal(fields.blPurchaseOrder, 'PO-0004229784');
  assert.equal(
    extractFields('bl', 'Container No.: Protect\nContainer Size: 40').blContainer,
    undefined,
  );
});

test('a multi-container waybill cannot supply a single unmatched pair to PL', () => {
  const source = item(
    'bl',
    extractFields(
      'bl',
      ['B/L No. BL100', 'TSTU1234567 / TEST-1234', 'TSTU7654321 / TEST-5678'].join('\n'),
    ),
  );
  const pl = packing({ plBillNo: 'BL100' });
  const resolved = resolvePackingIdentifiers([pl, source], pl);
  assert.ok(resolved.reason);
  assert.equal(resolved.plContainer, undefined);
  assert.equal(resolved.plSeal, undefined);
});
