import { recognizeDocument } from './document-recognition.js';
import { textBlocks, textRows } from './pdf-layout.js';

export function pageLayoutText(page) {
  const items = page.recognized.length ? page.recognized : page.native;
  return (
    textRows(items)
      .map(({ spans }) =>
        textBlocks(spans, true)
          .map(({ text }) => text)
          .join('  '),
      )
      .join('\n') || page.text
  );
}

const referenceLabels = {
  booking: /^(?:booking|bkg)\s*(?:no\.?|number|ref\.?)\s*[:#]?/i,
  bl: /^(?:B\s*\/?\s*L|waybill)\s*(?:no\.?|number)\s*[:#]?/i,
  invoice: /^(?:commercial\s+)?invoice\s*(?:no\.?|number)\s*[:#]?/i,
  packing: /^invoice\s*(?:no\.?|number)\s*[:#]?/i,
};

function pageReference(layout, type) {
  const label = referenceLabels[type];
  if (!label) return '';
  for (const row of layout.split(/\r?\n/).slice(0, 18)) {
    const cells = row.split(/ {2,}/).map((cell) => cell.trim());
    const column = cells.findIndex((cell) => label.test(cell));
    if (column < 0) continue;
    const value = cells[column].replace(label, '').trim() || cells[column + 1];
    if (value && /^[A-Z0-9/-]*\d[A-Z0-9/-]*$/i.test(value)) return value.toUpperCase();
  }
  return '';
}

export function pdfDocuments(name, pages) {
  const groups = [];
  for (const source of pages) {
    const layout = pageLayoutText(source);
    const page = { ...source, layout };
    const classification = recognizeDocument('', layout);
    const current = groups.at(-1);
    const reference = classification.heading ? pageReference(layout, classification.type) : '';
    const newDocument =
      classification.heading &&
      current &&
      (classification.type !== current.type ||
        (reference && current.reference && reference !== current.reference));
    if (!current || newDocument) {
      groups.push({
        pages: [page],
        type: classification.type,
        heading: classification.heading,
        recognition: classification,
        reference,
      });
    } else {
      current.pages.push(page);
      if (classification.heading && !current.heading) {
        Object.assign(current, {
          type: classification.type,
          heading: true,
          reference,
          recognition: classification,
        });
      } else if (!current.reference && reference) current.reference = reference;
    }
  }
  return groups.map(({ pages: groupPages, heading, recognition }) => {
    const layout = groupPages.map((page) => `[Trang ${page.number}]\n${page.layout}`).join('\n');
    return {
      pages: groupPages,
      layout,
      recognition: heading ? recognition : recognizeDocument(name, layout),
    };
  });
}
