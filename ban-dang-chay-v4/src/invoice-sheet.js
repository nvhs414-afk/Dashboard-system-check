import { norm, num, weightText } from './field-values.js';

const quantityUnits = /^(?:pcs?|pieces?|sets?|units?|ctns?|cartons?|kgs?)$/i;
const months = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');

function invoiceDate(text) {
  const named = text.match(/^(\d{1,2})[- /]([a-z]{3,9})[- /](\d{2}|\d{4})$/i);
  if (named) {
    const month = months.indexOf(named[2].slice(0, 3).toLowerCase()) + 1;
    if (month) {
      const year = named[3].length === 2 ? '20' + named[3] : named[3];
      return `${named[1].padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    }
  }
  return /^\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(text) ? text : '';
}

export function labeledValue(rows, label) {
  for (const row of rows) {
    for (const [column, cell] of row.entries()) {
      const [caption, ...inline] = cell.split(/[:：]/);
      if (!label.test(norm(caption))) continue;
      const value = inline.join(':').trim() || row.slice(column + 1).find(Boolean);
      if (value) return value;
    }
  }
  return '';
}

function tableValues(rows, headerIndex) {
  const header = rows[headerIndex];
  const column = (label) => header.findIndex((cell) => label.test(norm(cell)));
  const quantity = column(/^(?:quantity|qty|so luong)(?: |$)/);
  const unit = column(/^(?:unit|uom|don vi(?: tinh)?)$/);
  const amount = column(/^(?:amount|total amount|tri gia)(?: |$)/);
  const description = column(/^(?:description(?: of goods)?|ten hang)$/);
  const net = column(/^(?:net weight|trong luong tinh)(?: |$)/);
  const gross = column(/^(?:gross weight|trong luong ca bi)(?: |$)/);

  const data = rows.slice(headerIndex + 1);
  const totalIndex = data.findIndex((row) =>
    row.some((cell) => /^(?:total|grand total|tong cong)$/.test(norm(cell))),
  );
  if (totalIndex < 0) return {};

  const total = data[totalIndex];
  const details = data.slice(0, totalIndex).filter((row) => /^\d+$/.test(row[0]));
  const numberAt = (index) => {
    const cell = total[index] || '';
    if (!/^\d[\d.,]*$/.test(cell)) return '';
    const value = num(cell);
    return Number.isFinite(value) ? String(value) : '';
  };
  const currency = norm([header[amount], data[0]?.[amount]].filter(Boolean).join(' '));
  const totalUnit = total[unit >= 0 ? unit : quantity + 1];
  const itemUnits = new Set(details.map((row) => row[unit >= 0 ? unit : quantity + 1]));
  const uniformUnit = itemUnits.size === 1 ? [...itemUnits][0] : '';
  const selectedUnit = totalUnit || uniformUnit || '';
  const knownUnit =
    quantityUnits.test(selectedUnit) && (!itemUnits.size || uniformUnit === selectedUnit);

  const itemNames = new Set(details.map((row) => row[description]).filter(Boolean));
  const goodsHeading = data
    .slice(0, totalIndex)
    .find((row) => !row[0] && /\p{L}/u.test(row[description] || '') && !row[quantity]);

  return {
    description: goodsHeading?.[description] || [...itemNames].join('; '),
    invoiceQty: itemUnits.size > 1 ? '' : numberAt(quantity),
    invoiceUnit: knownUnit ? selectedUnit.toUpperCase() : '',
    invoiceValue: /\busd\b/.test(currency) ? numberAt(amount) : '',
    invoiceNet: /\b(?:kg|kgs|kgm)\b/.test(norm(header[net])) ? numberAt(net) : '',
    invoiceGross: /\b(?:kg|kgs|kgm)\b/.test(norm(header[gross])) ? weightText(total[gross]) : '',
  };
}

export function extractInvoiceSheet(rows) {
  const cells = rows.map((row) => row.map((cell) => String(cell ?? '').trim()));
  const titleIndex = cells.findIndex((row) =>
    row.some((cell) => /^(?:commercial invoice|invoice|hoa don thuong mai)$/.test(norm(cell))),
  );
  const headerIndex = cells.findIndex((row) => {
    const labels = row.map(norm);
    return (
      labels.some((label) => /^(?:description(?: of goods)?|ten hang)$/.test(label)) &&
      labels.some((label) => /^(?:quantity|qty|so luong)(?: |$)/.test(label))
    );
  });
  const header = cells.slice(Math.max(0, titleIndex), headerIndex < 0 ? undefined : headerIndex);
  const fields = {
    invoiceNo: labeledValue(header, /^(?:invoice (?:no|number)|so hoa don)$/),
    invoiceDate: invoiceDate(labeledValue(header, /^(?:invoice date|ngay hoa don)$/)),
    exporter: labeledValue(header, /^(?:exporter|seller|shipped by|shipper|nguoi xuat khau)$/),
    importer: labeledValue(
      header,
      /^(?:importer|buyer|for account(?: and risk)? of(?: messrs)?|nguoi nhap khau)$/,
    ),
  };
  if (titleIndex >= 0) {
    fields.invoiceNo ||= labeledValue(header, /^no$/);
    fields.invoiceDate ||= invoiceDate(labeledValue(header, /^date$/));
  }
  if (headerIndex >= 0) Object.assign(fields, tableValues(cells, headerIndex));
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value));
}
