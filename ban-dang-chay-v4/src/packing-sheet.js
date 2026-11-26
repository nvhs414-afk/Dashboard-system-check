import { norm, num, weightText } from './field-values.js';
import { labeledValue } from './invoice-sheet.js';

const grossHeading = /^(?:gross weight|trong luong ca bi)(?: kg| kgs| kgm)?$/;
const netHeading = /^(?:net weight|trong luong tinh)(?: kg| kgs| kgm)?$/;
const cartonsHeading =
  /^(?:(?:no of|number of|total) )?(?:ctn s|ctns?|cartons?|so thung)(?: qty| quantity)?$/;
const quantityHeading = /^(?:quantity|qty|so luong)(?: |$)/;

function totalNumber(cell) {
  const amount = String(cell ?? '').trim();
  const value = /^\d[\d.,]*$/.test(amount) ? num(amount) : NaN;
  return Number.isFinite(value) ? String(value) : '';
}

function totalWeight(total, header, column) {
  if (column < 0) return '';
  const cell = String(total[column] ?? '').trim();
  // A merged weight heading can cover a unit cell followed by the numeric total.
  if (/^(?:kg|kgs|kgm)$/i.test(cell)) return weightText(total[column + 1]);
  if (!/\b(?:kg|kgs|kgm)\b/.test(norm(header[column])) && !/\b(?:kg|kgs|kgm)\b/i.test(cell))
    return '';
  return weightText(cell);
}

export function extractPackingSheet(rows) {
  const headerIndex = rows.findIndex(
    (row) =>
      row
        .map(norm)
        .filter(
          (cell) =>
            grossHeading.test(cell) ||
            netHeading.test(cell) ||
            cartonsHeading.test(cell) ||
            quantityHeading.test(cell) ||
            /^(?:item|description(?: of goods)?|d?on vi(?: tinh)?|unit|uom)$/.test(cell),
        ).length >= 2,
  );
  const titleIndex = rows.findIndex((row) => row.some((cell) => norm(cell) === 'packing list'));
  const heading = rows.slice(Math.max(titleIndex, 0), headerIndex < 0 ? undefined : headerIndex);
  const fields = {
    plInvoiceNo:
      labeledValue(heading, /^(?:invoice (?:no|number)|so hoa don)$/) ||
      (titleIndex >= 0 ? labeledValue(heading, /^no$/) : ''),
    plExporter: labeledValue(heading, /^(?:exporter|seller|shipped by|shipper|nguoi xuat khau)$/),
    plImporter: labeledValue(
      heading,
      /^(?:importer|buyer|for account(?: and risk)? of(?: messrs)?|nguoi nhap khau)$/,
    ),
  };
  const container = labeledValue(rows, /^(?:container (?:no|number)|so container)$/);
  const seal = labeledValue(rows, /^(?:seal(?: no| number)?|so seal)$/);
  if (/^[A-Z]{4}\d{7}$/i.test(container)) fields.plContainer = container;
  if (/^[A-Z0-9][A-Z0-9./_-]+$/i.test(seal)) fields.plSeal = seal;
  if (headerIndex < 0) return fields;

  const header = rows[headerIndex];
  const column = (label) => header.findIndex((cell) => label.test(norm(cell)));
  const total = rows
    .slice(headerIndex + 1)
    .find((row) => row.some((cell) => /^(?:total|grand total|tong cong)$/.test(norm(cell))));
  if (!total) return fields;

  const cartons = totalNumber(total[column(cartonsHeading)]);
  const qtyColumn = column(quantityHeading);
  const unitColumn = column(/^(?:unit|uom|d?on vi(?: tinh)?)$/);
  const explicitUnit = String(total[unitColumn] ?? '').trim();
  const quantityLabel = String(header[qtyColumn] ?? '');
  const headerUnit = /\bpcs\s*\/\s*set\b/i.test(quantityLabel)
    ? 'PCS/SET'
    : norm(quantityLabel).match(
        /^(?:quantity|qty|so luong) (pcs|pieces|sets?|units|ctns|cartons)$/,
      )?.[1];
  const quantity = totalNumber(total[qtyColumn]);
  const unit = /^(?:pcs|pieces|sets?|units|ctns|cartons|pcs\s*\/\s*set)$/i.test(explicitUnit)
    ? explicitUnit
    : headerUnit;
  if (qtyColumn >= 0) {
    fields.plQty = quantity;
    fields.plUnit = unit?.replace(/\s+/g, '').toUpperCase() || '';
  } else if (cartons) {
    fields.plQty = cartons;
    fields.plUnit = 'CTN';
  }
  fields.plNet = totalWeight(total, header, column(netHeading));
  fields.plGross = totalWeight(total, header, column(grossHeading));
  return fields;
}
