import { num } from './field-values.js';

export const state = {
  queue: [],
  seen: new Set(),
  manual: new Set(),
  form: {},
  scanning: false,
  checks: [],
  draft: null,
  active: 'invoice',
  notice: '',
  showAll: false,
};
export function value(k) {
  return String(state.form[k] ?? '').trim();
}

function matchingPackingLists() {
  const invoiceNo = value('invoiceNo').toUpperCase();
  if (!invoiceNo) return [];
  return state.queue.filter(
    (item) =>
      item.type === 'packing' &&
      item.status === 'Đã nhận diện' &&
      item.fields.plInvoiceNo?.toUpperCase() === invoiceNo,
  );
}

export function packingGrossForInvoice() {
  if (value('invoiceGross') || state.manual.has('invoiceGross')) return '';
  const totals = matchingPackingLists()
    .map((item) => item.fields.plGross)
    .filter(Boolean);
  const first = num(totals[0]);
  return Number.isFinite(first) && totals.every((total) => num(total) === first) ? totals[0] : '';
}

export function packingUnitForInvoice() {
  const invoiceUnit = value('invoiceUnit');
  if (state.manual.has('invoiceUnit') || !/^(?:PCS|SET)?$/i.test(invoiceUnit)) return '';
  const quantity = num(value('invoiceQty'));
  const units = new Set(
    matchingPackingLists()
      .filter((item) => num(item.fields.plQty) === quantity)
      .map((item) => item.fields.plUnit)
      .filter(Boolean),
  );
  return units.size === 1 && units.has('PCS/SET') ? 'PCS/SET' : '';
}
