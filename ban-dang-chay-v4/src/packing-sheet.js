import { norm, num, weightText } from './field-values.js';
import { labeledValue } from './invoice-sheet.js';
import { normalizedContainer, normalizedSeal } from './bill-of-lading.js';

const grossHeading = /^(?:gross weight|trong luong ca bi)(?: kg| kgs| kgm)?$/;
const netHeading = /^(?:net weight|trong luong tinh)(?: kg| kgs| kgm)?$/;
const cartonsHeading =
  /^(?:(?:no of|number of|total) )?(?:ctn s|ctns?|cartons?|so thung)(?: qty| quantity)?$/;
const quantityHeading = /^(?:quantity|qty|so luong)(?: |$)/;
const itemHeading = /^(?:item(?: no| number| code)?|sku|ma hang)$/;
const descriptionHeading =
  /^(?:description(?: of goods)?|goods description|ten hang|mo ta hang hoa)$/;
const sizeHeading = /^(?:size|dimensions?|kich thuoc)(?: |$)/;
const totalHeading = /^(?:total|grand total|tong cong)$/;
const subtotalHeading = /^(?:sub ?total|page total|tong phu)(?: |$)/;

const cellText = (cell) =>
  String(cell ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const isTotalRow = (row) => row.some((cell) => totalHeading.test(norm(cell)));

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

function packingItems(rows) {
  const headerIndex = rows.findIndex((row) => {
    const labels = row.map(norm);
    return [itemHeading, descriptionHeading, quantityHeading].every((label) =>
      labels.some((value) => label.test(value)),
    );
  });
  if (headerIndex < 0) return '';

  const header = rows[headerIndex];
  const column = (label) => header.findIndex((cell) => label.test(norm(cell)));
  const item = column(itemHeading);
  const description = column(descriptionHeading);
  const size = column(sizeHeading);
  const quantity = column(quantityHeading);
  const following = rows.slice(headerIndex + 1);
  const totalIndex = following.findIndex(isTotalRow);
  const details = (totalIndex < 0 ? following : following.slice(0, totalIndex)).filter((row) => {
    const itemCode = norm(row[item]);
    const itemDescription = cellText(row[description]);
    const itemQuantity = totalNumber(row[quantity]);
    if (itemHeading.test(itemCode) || subtotalHeading.test(itemCode || norm(itemDescription)))
      return false;
    return itemCode ? itemDescription || itemQuantity : itemDescription && itemQuantity;
  });
  if (!details.length) return '';

  const total = totalNumber(following[totalIndex]?.[quantity]);
  const sumMatchesTotal = (index) => {
    const numbers = details.map((row) => totalNumber(row[index]));
    if (!total || numbers.some((number) => !number)) return false;
    const sum = numbers.reduce((sum, number) => sum + Number(number), 0);
    return Math.abs(sum - Number(total)) <= Math.max(1, Math.abs(sum)) * 1e-8;
  };
  // Merged cells can put quantities per carton on the left and line totals on the right.
  // Use the adjacent column only when it shares the heading and its sum confirms the total.
  const quantityColumn =
    !cellText(header[quantity + 1]) && !sumMatchesTotal(quantity) && sumMatchesTotal(quantity + 1)
      ? quantity + 1
      : quantity;
  return details
    .map((row) =>
      [row[item], row[description], row[size], row[quantityColumn]]
        .map((cell) => cellText(cell) || '—')
        .join(' - '),
    )
    .join('\n');
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
            itemHeading.test(cell) ||
            descriptionHeading.test(cell) ||
            /^(?:d?on vi(?: tinh)?|unit|uom)$/.test(cell),
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
  fields.plContainer = normalizedContainer(container);
  fields.plSeal = normalizedSeal(seal);
  fields.plItems = packingItems(rows);
  if (headerIndex < 0) return fields;

  const header = rows[headerIndex];
  const column = (label) => header.findIndex((cell) => label.test(norm(cell)));
  const total = rows.slice(headerIndex + 1).find(isTotalRow);
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
