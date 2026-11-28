import { weightText } from './field-values.js';
import { textBlocks, textRows } from './pdf-layout.js';

const portLabels = {
  blPol: /^(?:port of loading|pol)$/i,
  blPod: /^(?:port of discharg(?:e|ing)|pod)$/i,
};
const otherLabel =
  /^(?:place of (?:receipt|delivery)|final destination|for transshipment|onward inland routing|pre-carriage|ocean vessel|container no\.?|description of|gross weight|measurement|shipper|consignee|notify party)\b/i;
const headingText = (text) => text.replace(/[\s:*]+$/, '');

export function extractContainerSeal(text) {
  const container = /\b([A-Z]{3}[UJZ][ \t]*\d{7})[ \t]*\/[ \t]*([A-Z0-9][A-Z0-9.-]{2,})\b/i;
  const match = text.match(container);
  if (!match) return {};
  return { blContainer: match[1].replace(/\s/g, '').toUpperCase(), blSeal: match[2] };
}

function boxValue(rows, index, column, inset = 8) {
  const row = rows[index];
  const heading = row.blocks[column];
  let headingContinues = /\([^)]*$/.test(heading.text);
  const right = row.blocks[column + 1]?.x ?? Infinity;
  const maxDrop = Math.max(16, heading.height * 3);
  for (let line = index + 1; line < rows.length; line++) {
    const next = rows[line];
    if (row.y - next.y > maxDrop) break;
    // Follow the heading's left edge to stay in the same printed form cell.
    const candidate = next.blocks.find(
      (block) => Math.abs(block.x - heading.x) <= inset && block.x < right,
    );
    if (!candidate) continue;
    if (headingContinues && !otherLabel.test(candidate.text)) {
      headingContinues = !candidate.text.includes(')');
      continue;
    }
    if (
      !otherLabel.test(candidate.text) &&
      !Object.values(portLabels).some((re) => re.test(headingText(candidate.text))) &&
      /\p{L}/u.test(candidate.text)
    ) {
      return { text: candidate.text, line, x: candidate.x, right };
    }
    break;
  }
}

function bookingReference(rows) {
  const label = /^Booking (?:No\.?|Number)\s*:?\s*(.*)$/i;
  const number = /^[A-Z0-9-]*\d[A-Z0-9-]*$/i;
  for (const [index, row] of rows.entries()) {
    for (const block of row.blocks) {
      const match = block.text.match(label);
      if (!match) continue;
      if (number.test(match[1])) return match[1];
      if (match[1]) continue;
      for (const next of rows.slice(index + 1)) {
        if (row.y - next.y > 18) break;
        const candidate = next.blocks.find(({ x }) => Math.abs(x - block.x) <= 10);
        if (candidate && number.test(candidate.text)) return candidate.text;
        if (candidate) break;
      }
    }
  }
  return '';
}

function grossWeight(rows, index, column) {
  const header = rows[index];
  const left = header.blocks[column].x;
  const right = header.blocks[column + 1]?.x ?? left + 95;
  const inColumn = ({ x, end }) => x >= left - 5 && end <= right + 3;
  const hasUnit = (block) => inColumn(block) && /^(?:kgs?|kgm)$/i.test(block.text);
  for (let line = index + 1; line < rows.length && header.y - rows[line].y <= 30; line++) {
    const weight = rows[line].blocks.find(
      (block) => inColumn(block) && /^\d[\d.,]*(?:\s*(?:kgs?|kgm))?$/i.test(block.text),
    );
    if (!weight) continue;
    const followingRows = rows.slice(line).filter((row) => rows[line].y - row.y <= 14);
    const kilograms =
      /(?:kgs?|kgm)\)?$/i.test(header.blocks[column].text) ||
      /(?:kgs?|kgm)$/i.test(weight.text) ||
      followingRows.some((row) => row.blocks.some(hasUnit));
    const amount = weightText(weight.text);
    if (kilograms && amount) return amount;
  }
  return '';
}

function alignedKilograms(rows) {
  const totals = new Set();
  for (const [index, row] of rows.entries()) {
    for (const unit of row.blocks.filter(({ text }) => /^(?:kgs?|kgm)$/i.test(text))) {
      const volumeBesideWeight = row.blocks.some(
        ({ x, text }) => x > unit.end && /^(?:cbm|m³)$/i.test(text),
      );
      const cargoHeading = rows
        .slice(0, index)
        .some(
          (heading) =>
            heading.y - row.y <= 38 &&
            heading.blocks.some(
              ({ x, text }) => x > unit.end && /^measurement$/i.test(headingText(text)),
            ),
        );
      if (!cargoHeading && !volumeBesideWeight) continue;
      for (let line = index - 1; line >= 0 && rows[line].y - row.y <= 14; line--) {
        const weight = rows[line].blocks.find(
          ({ end, text }) => Math.abs(end - unit.end) <= 6 && /^\d[\d.,]*$/.test(text),
        );
        if (!weight) continue;
        const amount = weightText(weight.text);
        if (amount) totals.add(amount);
        break;
      }
    }
  }
  return totals.size === 1 ? [...totals][0] : '';
}

function partyQualifier(rows, value) {
  for (
    let line = value.line + 1;
    line < rows.length && rows[value.line].y - rows[line].y <= 14;
    line++
  ) {
    const candidate = rows[line].blocks.find(
      ({ x }) => Math.abs(x - value.x) <= 12 && x < value.right,
    );
    if (candidate) return /^\([A-Z]{2,5}\)$/.test(candidate.text) ? ' ' + candidate.text : '';
  }
  return '';
}

export function extractBillOfLadingFields(items) {
  const rows = textRows(items).map(({ y, spans }) => ({ y, blocks: textBlocks(spans, true) }));
  const fields = {};
  const partyLabels = {
    blExporter: /^(?:shipper(?:\s*\/\s*exporter)?|exporter)(?:\s*\([^)]*\))?$/i,
    blImporter: /^consignee(?:\s*\([^)]*\)?)?$/i,
  };
  for (const [field, label] of Object.entries({ ...portLabels, ...partyLabels })) {
    for (const [index, row] of rows.entries()) {
      const column = row.blocks.findIndex((block) => label.test(headingText(block.text)));
      if (column < 0) continue;
      const party = Object.hasOwn(partyLabels, field);
      const value = boxValue(rows, index, column, party ? 16 : 8);
      if (!value) continue;
      // A short parenthesized qualifier can be printed below the company name.
      fields[field] = value.text + (party ? partyQualifier(rows, value) : '');
      break;
    }
  }
  for (const [index, row] of rows.entries()) {
    const column = row.blocks.findIndex(({ text }) =>
      /^gross weight(?:\s*\((?:kgs?|kgm)\))?$/i.test(headingText(text)),
    );
    if (column < 0) continue;
    const weight = grossWeight(rows, index, column);
    if (weight) {
      fields.blGross = weight;
      break;
    }
  }
  const weight = fields.blGross || alignedKilograms(rows);
  if (weight) fields.blGross = weight;
  const reference = bookingReference(rows);
  if (reference) fields.blBookingNo = reference;
  const lines = rows.map((row) => row.blocks.map(({ text }) => text).join(' ')).join('\n');
  return { ...fields, ...extractContainerSeal(lines) };
}
