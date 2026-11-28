import { num } from './field-values.js';
import { bookingFreeTime } from './booking-free-time.js';
import { selectBookingSources } from './booking-revisions.js';
import { resolvePackingIdentifiers } from './packing-identifiers.js';

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

export function bookingFreeTimeEvidence(sources = selectBookingSources(state.queue).sources) {
  return sources.flatMap((item) =>
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
  const packing = state.queue.filter(
    (item) => item.type === 'packing' && item.status === 'Đã nhận diện',
  );
  const invoice = value('plInvoiceNo').toUpperCase();
  const selected = invoice
    ? packing.filter(({ fields }) => fields.plInvoiceNo?.toUpperCase() === invoice)
    : packing;
  if (selected.length !== 1)
    return selected.length > 1 ? { reason: 'Có nhiều Packing List cùng số Invoice.' } : {};
  const resolved = resolvePackingIdentifiers(state.queue, {
    ...selected[0],
    fields: { ...selected[0].fields, plContainer: value('plContainer'), plSeal: value('plSeal') },
  });
  for (const key of ['plContainer', 'plSeal']) if (state.manual.has(key)) delete resolved[key];
  return resolved;
}

export function billPartiesForBooking() {
  const booking = value('bookingNo').toUpperCase();
  if (!booking) return {};
  const bills = state.queue.filter(
    (item) =>
      item.type === 'bl' &&
      item.status === 'Đã nhận diện' &&
      item.fields.blBookingNo?.toUpperCase() === booking,
  );
  const party = (field) => {
    const names = new Set(bills.map((item) => item.fields[field]).filter(Boolean));
    return names.size === 1 ? [...names][0] : '';
  };
  return {
    bookingShipper:
      value('bookingShipper') || state.manual.has('bookingShipper') ? '' : party('blExporter'),
    bookingConsignee:
      value('bookingConsignee') || state.manual.has('bookingConsignee') ? '' : party('blImporter'),
  };
}
