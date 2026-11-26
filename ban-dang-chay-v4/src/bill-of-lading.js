import { num } from './field-values.js';

const portLabels = {
  blPol: /^(?:port of loading|pol)$/i,
  blPod: /^(?:port of discharg(?:e|ing)|pod)$/i,
};
const otherLabel =
  /^(?:place of (?:receipt|delivery)|final destination|for transshipment|onward inland routing|pre-carriage|ocean vessel|container no\.?|description of|gross weight|measurement|shipper|consignee|notify party)\b/i;
const headingText = (text) => text.replace(/[\s:*]+$/, '');

function textRows(items) {
  const spans = items
    .filter((item) => item.str?.trim() && item.transform)
    .map(({ str, transform: [, , , , x, y], width, height }) => ({
      text: str.trim(),
      x,
      y,
      end: x + width,
      height,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const span of spans) {
    const row = rows.at(-1);
    if (row && row.y - span.y <= 2) row.spans.push(span);
    else rows.push({ y: span.y, spans: [span] });
  }
  return rows;
}

function textBlocks(spans) {
  const blocks = [];
  for (const span of spans.sort((a, b) => a.x - b.x)) {
    const previous = blocks.at(-1);
    if (previous && span.x - previous.end <= Math.max(5, span.height, previous.height)) {
      previous.text += ' ' + span.text;
      previous.end = Math.max(previous.end, span.end);
    } else blocks.push({ ...span });
  }
  return blocks;
}

export function extractContainerSeal(text) {
  const container = /\b([A-Z]{3}[UJZ][ \t]*\d{7})[ \t]*\/[ \t]*([A-Z0-9][A-Z0-9.-]{2,})\b/i;
  const match = text.match(container);
  if (!match) return {};
  return { blContainer: match[1].replace(/\s/g, '').toUpperCase(), blSeal: match[2] };
}

function boxValue(rows, index, column, inset = 8) {
  const row = rows[index];
  const heading = row.blocks[column];
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
    const amount = num(weight.text);
    if (kilograms && Number.isFinite(amount)) return String(amount);
  }
  return '';
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
  const rows = textRows(items).map(({ y, spans }) => ({ y, blocks: textBlocks(spans) }));
  const fields = {};
  const partyLabels = {
    blExporter: /^(?:shipper(?:\s*\/\s*exporter)?|exporter)(?:\s*\([^)]*\))?$/i,
    blImporter: /^consignee(?:\s*\([^)]*\))?$/i,
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
  const lines = rows.map((row) => row.blocks.map(({ text }) => text).join(' ')).join('\n');
  return { ...fields, ...extractContainerSeal(lines) };
}
