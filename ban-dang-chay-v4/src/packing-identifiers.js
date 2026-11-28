import { normalizedContainer, normalizedSeal } from './bill-of-lading.js';
import { selectBookingSources } from './booking-revisions.js';
import { referenceKey } from './shipment-references.js';

export function resolvePackingIdentifiers(queue, packing) {
  const document = packing.fields;
  if (document.plIdentifierConflict)
    return { reason: 'Packing List ghi nhiều Container hoặc Seal.' };
  const billNo = referenceKey(document.plBillNo);
  const orders = String(document.plPurchaseOrder || '')
    .split('\n')
    .map(referenceKey)
    .filter(Boolean);
  const bookingNo = referenceKey(document.plBookingNo);
  const ready = queue.filter((item) => item.status === 'Đã nhận diện');
  const sharesOrder = (value) => {
    const sourceOrders = String(value || '')
      .split('\n')
      .map(referenceKey);
    return orders.some((order) => sourceOrders.includes(order));
  };
  const bills = ready.filter(({ type, fields }) => {
    const reference = referenceKey(fields.blBillNo);
    if (type !== 'bl' || !reference) return false;
    if (billNo) return reference === billNo || referenceKey(fields.blBillNoAlias) === billNo;
    if (bookingNo && referenceKey(fields.blBookingNo) !== bookingNo) return false;
    return sharesOrder(fields.blPurchaseOrder) || Boolean(bookingNo);
  });
  const references = new Set(bills.map(({ fields }) => referenceKey(fields.blBillNo)));
  if (!billNo) {
    const aliases = new Set(
      bills.map(({ fields }) => referenceKey(fields.blBillNoAlias)).filter(Boolean),
    );
    for (const { type, fields } of ready) {
      if (type !== 'booking' || !fields.bookingBillNo) continue;
      if (bookingNo && referenceKey(fields.bookingNo) !== bookingNo) continue;
      if (!bookingNo && !sharesOrder(fields.bookingPurchaseOrder)) continue;
      const bookingBillNo = referenceKey(fields.bookingBillNo);
      if (!aliases.has(bookingBillNo)) references.add(bookingBillNo);
    }
  }
  if (references.size > 1) return { reason: 'Có nhiều vận đơn khớp với Packing List.' };
  const reference = [...references][0] || billNo;
  if (!reference) return { reason: 'Chưa có số vận đơn liên kết với Packing List.' };

  const linkedBookings = new Set(
    bills.map(({ fields }) => referenceKey(fields.blBookingNo)).filter(Boolean),
  );
  const referenceAliases = new Set([
    reference,
    ...bills.map(({ fields }) => referenceKey(fields.blBillNoAlias)).filter(Boolean),
  ]);
  const compatible = ready.filter(
    ({ type, fields }) =>
      type === 'booking' &&
      (fields.bookingBillNo
        ? referenceAliases.has(referenceKey(fields.bookingBillNo))
        : linkedBookings.size === 1 && linkedBookings.has(referenceKey(fields.bookingNo))),
  );
  const bookings = selectBookingSources(compatible).sources;
  if ([...bills, ...bookings].some(({ type, fields }) => fields[type + 'IdentifierConflict'])) {
    return { reason: 'Chứng từ của vận đơn này ghi nhiều Container hoặc Seal.' };
  }
  const identifiers = [
    ['plContainer', 'Container', normalizedContainer],
    ['plSeal', 'Seal', normalizedSeal],
  ];
  const candidates = [...bills, ...bookings].map((item) => ({
    item,
    values: Object.fromEntries(
      identifiers.map(([key, suffix, normalize]) => [
        key,
        normalize(item.fields[item.type + suffix]),
      ]),
    ),
  }));
  const values = {};
  for (const [key, , normalize] of identifiers) {
    const distinct = new Set(
      candidates.map((candidate) => referenceKey(candidate.values[key])).filter(Boolean),
    );
    const present = referenceKey(normalize(document[key]));
    if (distinct.size > 1 || (present && distinct.size && !distinct.has(present))) {
      return { reason: 'Container hoặc Seal khác nhau giữa các chứng từ của cùng vận đơn.' };
    }
    if (present) continue;
    const source = candidates.find((candidate) => candidate.values[key]);
    if (source) values[key] = { value: source.values[key], item: source.item };
  }
  return { ...values, reference };
}
