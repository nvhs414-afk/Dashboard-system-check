import { norm } from './field-values.js';
import { selectBookingSources } from './booking-revisions.js';
import { referenceKey, shipmentReferences } from './shipment-references.js';

const hsLabel = /(?:\bH\.?S\.?\s*(?:code|no\.?|number)\b|mã\s*(?:số\s*)?HS\b)\s*[:：#=]?\s*/gi;
const hsCode = String.raw`(?:\d{4}(?:\.\d{2}){1,3}|\d{6}|\d{8}|\d{10})(?!\d|\.\d)`;
const hsList = new RegExp(`^${hsCode}(?:\\s*[,/;\\n]\\s*${hsCode})*`);
const originLabel =
  /^(?:origin(?:\s+conferring)?\s+criteri(?:on|a)|criteri(?:on|a)\s+(?:of|for)\s+origin|tiêu\s+chí\s+xuất\s+xứ)\s*[:：=]?\s*(.*)$/i;

function hsCodes(text) {
  const codes = new Map();
  for (const match of text.matchAll(hsLabel)) {
    const found = text.slice(match.index + match[0].length).match(hsList)?.[0];
    for (const code of found?.split(/\s*[,/;\n]\s*/) || []) {
      const key = code.replace(/\./g, '');
      if (!codes.has(key)) codes.set(key, code);
    }
  }
  return { key: [...codes.keys()].sort().join('/'), value: [...codes.values()].join(' / ') };
}

function originCriteria(text) {
  const cells = text
    .split(/\r?\n|[|·\t]| {2,}/)
    .map((cell) => cell.trim())
    .filter(Boolean);
  const choices = new Map();
  for (const [index, cell] of cells.entries()) {
    const match = cell.match(originLabel);
    const next = cells[index + 1];
    const value =
      match && (match[1] || (/^[A-Z]{1,8}(?:\s*\d{1,3}\s*%)?$/.test(next || '') ? next : ''));
    if (
      !value ||
      value.length > 65 ||
      /[:：]|^\[Trang|^N\/?A$|^[—–-]+$/i.test(value) ||
      !/\p{L}/u.test(value)
    )
      continue;
    choices.set(norm(value), value);
  }
  return choices;
}

function references(item) {
  const fields = { ...shipmentReferences(item.raw || '', item.type), ...item.fields };
  const prefix = item.type === 'packing' ? 'pl' : item.type;
  const keys = (...values) =>
    values
      .flatMap((value) => (value || '').split('\n'))
      .map(referenceKey)
      .filter(Boolean);
  return [
    keys(fields[prefix + 'BillNo'], fields.blBillNoAlias),
    keys(fields[prefix + 'BookingNo']),
    keys(fields[prefix + 'PurchaseOrder']),
  ];
}

function related(left, right) {
  const rightKeys = references(right);
  const overlaps = references(left).flatMap((values, index) => {
    const options = rightKeys[index];
    return values.length && options.length ? [values.some((key) => options.includes(key))] : [];
  });
  return overlaps.length > 0 && overlaps.every(Boolean);
}

function locateDraftSources(queue, value) {
  const ready = queue.filter((item) => item.status === 'Đã nhận diện');
  const invoiceNo = referenceKey(value('invoiceNo') || value('plInvoiceNo'));
  const invoice = ready.filter(
    (item) => item.type === 'invoice' && referenceKey(item.fields?.invoiceNo) === invoiceNo,
  );
  const packing = ready.filter(
    (item) => item.type === 'packing' && referenceKey(item.fields?.plInvoiceNo) === invoiceNo,
  );
  const anchors = [...invoice, ...packing];
  const bills = ready.filter(
    (item) =>
      item.type === 'bl' &&
      (anchors.length
        ? anchors.some((anchor) => related(anchor, item))
        : !invoiceNo && referenceKey(item.fields?.blBillNo) === referenceKey(value('blBillNo'))),
  );
  const supporting = [...anchors, ...bills];
  const bookings = selectBookingSources(
    ready.filter(
      (item) =>
        item.type === 'booking' &&
        (supporting.length
          ? supporting.some((anchor) => related(anchor, item))
          : !invoiceNo &&
            referenceKey(item.fields?.bookingNo) === referenceKey(value('bookingNo'))),
    ),
  ).sources;
  return { packing, sources: [...supporting, ...bookings] };
}

function selectEvidence(entries) {
  const candidates = new Map(entries.map(({ key, value }) => [key, value]));
  const files = [...new Set(entries.map(({ file }) => file))];
  if (candidates.size > 1) return { value: '', files, conflict: true };
  return { value: [...candidates.values()][0] || '', files };
}

export function certificateDraftFields(queue, value, { packingGross, packingUnit }) {
  const { packing, sources } = locateDraftSources(queue, value);
  const packingValue = (key) => {
    const values = new Set(packing.map((item) => item.fields?.[key]).filter(Boolean));
    return values.size === 1 ? [...values][0] : '';
  };
  const hs = [];
  const origin = [];
  for (const { name, raw = '', fields = {} } of sources) {
    const codes = hsCodes(raw);
    if (codes.key) hs.push({ ...codes, file: name });
    else if (fields.hs && new RegExp(`^${hsCode}$`).test(fields.hs))
      hs.push({ key: fields.hs.replace(/\./g, ''), value: fields.hs, file: name });
    for (const [key, value] of originCriteria(raw)) origin.push({ key, value, file: name });
  }
  const maHS = selectEvidence(hs);
  const tieuChiXuatXu = selectEvidence(origin);
  const invoiceQty = value('invoiceQty');
  const plItems = packingValue('plItems')
    .split('\n')
    .map((item) => item.split(' - ')[1])
    .filter((item) => item && item !== '—');
  return {
    hoaDon: value('invoiceNo') || (packing.length ? value('plInvoiceNo') : ''),
    ngayHoaDon: value('invoiceDate'),
    nguoiXuatKhau: value('exporter') || packingValue('plExporter'),
    nguoiNhapKhau: value('importer') || packingValue('plImporter'),
    tenHang: value('description') || [...new Set(plItems)].join(' / '),
    maHS: maHS.value,
    soLuong: (invoiceQty
      ? [invoiceQty, packingUnit || value('invoiceUnit')]
      : [packingValue('plQty'), packingValue('plUnit')]
    )
      .filter(Boolean)
      .join(' '),
    netWeightKg: value('invoiceNet'),
    grossWeightKg: value('invoiceGross') || packingGross || packingValue('plGross'),
    triGiaUSD: value('invoiceValue'),
    booking: value('bookingNo'),
    tieuChiXuatXu: tieuChiXuatXu.value,
    nguonTruong: {
      ...(maHS.files.length ? { maHS: { files: maHS.files, conflict: !!maHS.conflict } } : {}),
      ...(tieuChiXuatXu.files.length
        ? { tieuChiXuatXu: { files: tieuChiXuatXu.files, conflict: !!tieuChiXuatXu.conflict } }
        : {}),
    },
  };
}
