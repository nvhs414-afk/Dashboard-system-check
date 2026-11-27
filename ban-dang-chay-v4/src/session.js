import { num } from './field-values.js';
import { bookingFreeTime } from './booking-free-time.js';

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

export function bookingFreeTimeEvidence() {
  return state.queue
    .filter((item) => item.type === 'booking' && item.status === 'Đã nhận diện')
    .flatMap((item) =>
      bookingFreeTime(item.raw || '').map((entry) => ({ ...entry, file: item.name })),
    );
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

export function billIdentifiersForPacking() {
  const recognized = state.queue.filter((item) => item.status === 'Đã nhận diện');
  if (!recognized.some((item) => item.type === 'packing')) return {};
  const bills = recognized.filter((item) => item.type === 'bl');
  if (!bills.length) return {};

  for (const field of ['blContainer', 'blSeal']) {
    const values = new Set(
      bills.map((item) => item.fields[field]?.trim().toUpperCase()).filter(Boolean),
    );
    if (values.size > 1) return {};
  }
  if (
    bills.length > 1 &&
    value('blContainer') &&
    value('blSeal') &&
    !bills.some(({ fields }) => fields.blContainer && fields.blSeal)
  )
    return {};

  return {
    plContainer: state.manual.has('plContainer') ? '' : value('blContainer'),
    plSeal: state.manual.has('plSeal') ? '' : value('blSeal'),
  };
}
