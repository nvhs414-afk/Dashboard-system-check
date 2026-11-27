import assert from 'node:assert/strict';
import test from 'node:test';
import { billIdentifiersForPacking, state } from '../src/session.js';

const packing = { type: 'packing', status: 'Đã nhận diện', fields: {} };
const bill = (blContainer, blSeal) => ({
  type: 'bl',
  status: 'Đã nhận diện',
  fields: { blContainer, blSeal },
});

test('Packing List uses the same identifiers currently shown on the B/L', () => {
  const source = bill('TSTU1234567', 'TEST-1234');
  state.queue = [packing, source, bill('TSTU1234567', 'TEST-1234')];
  state.form = { ...source.fields, plContainer: 'TEST-PACKING-VALUE' };
  state.manual.clear();
  assert.deepEqual(billIdentifiersForPacking(), {
    plContainer: 'TSTU1234567',
    plSeal: 'TEST-1234',
  });

  state.form.blSeal = 'EDITED-5678';
  state.manual.add('plContainer');
  assert.deepEqual(billIdentifiersForPacking(), { plContainer: '', plSeal: 'EDITED-5678' });
});

test('conflicting bills or one missing document suppress the automatic copy', () => {
  state.form = bill('TSTU1234567', 'TEST-1234').fields;
  state.manual.clear();
  for (const queue of [
    [packing],
    [bill('TSTU1234567', 'TEST-1234')],
    [packing, bill('TSTU1234567', 'TEST-1234'), bill('TSTU7654321', 'TEST-5678')],
    [packing, bill('TSTU1234567', ''), bill('', 'TEST-1234')],
  ]) {
    state.queue = queue;
    assert.deepEqual(billIdentifiersForPacking(), {});
  }
});
