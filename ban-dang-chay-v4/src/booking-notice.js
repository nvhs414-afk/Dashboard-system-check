import { norm, weightText } from './field-values.js';

const timeStamp = String.raw`(?:\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})(?:[ \t]+\d{1,2}:\d{2})?`;

function dateAfter(text, label) {
  return text.match(new RegExp(`(?:${label})[ \\t]*[:：]?[ \\t]*(${timeStamp})`, 'i'))?.[1] || '';
}

function portField(text, label) {
  const row = text.match(
    new RegExp(`^[ \\t]*(?:${label})[ \\t]*[:：][ \\t]*([^\\r\\n]+)`, 'im'),
  )?.[1];
  if (!row) return { display: '', row: '' };
  const nextField = /\s+(?:TML|Terminal|Facility Code|ETA|ETD)\s*[:：]/i;
  const place = row
    .split(nextField)[0]
    .trim()
    .replace(/[,;]+$/, '')
    .replace(/\s*\(/g, ' (');
  const terminal = row
    .match(/\b(?:TML|Terminal)\s*[:：]\s*(.+)/i)?.[1]
    .split(nextField)[0]
    .trim();
  return { row, display: [place, terminal].filter(Boolean).join(' · ') };
}

export function bookingNoticeFields(text) {
  const loading = portField(text, String.raw`Port\s+of\s+Loading|POL`);
  const discharge = portField(text, String.raw`Port\s+of\s+Discharg(?:e|ing)|POD`);
  const laterVoyages = [
    ...text.matchAll(/^[ \t]*(?:2nd|3rd)\s+Vessel\s*\/\s*Voyage\s*:[ \t]*([^\r\n]*)/gim),
  ];
  const direct =
    laterVoyages.length &&
    laterVoyages.every(([, value]) => !value.split(/\b(?:T\/S Port|Call Sign)\s*:/i)[0].trim());
  const gross = text.match(/\bGross\s+(?:WGT\.?|Weight)\s*[:：]\s*(\d[\d.,]*\s*(?:kgm|kgs?)\b)/i);

  return {
    bookingPol: loading.display,
    bookingPod: discharge.display,
    etd: dateAfter(text, String.raw`\bETD`),
    etaFirst: direct ? dateAfter(discharge.row, String.raw`\bETA`) : '',
    pickupDate: dateAfter(
      text,
      String.raw`Estimated Empty Pick[- ]?up Date(?:[ \t]*\([^\r\n)]*\))?`,
    ),
    cyCutoff: dateAfter(
      text,
      String.raw`Cargo Cut[- ]?off[ \t]*\(Terminal Facility\)(?:[ \t]*\([^\r\n)]*\))?`,
    ),
    siCutoff: dateAfter(text, String.raw`SI General Cut[- ]?off`),
    plannedWeight: weightText(gross?.[1]),
  };
}

export function samePort(booking, bill) {
  const portName = (value) =>
    norm(value.split(' · ')[0].replace(/\([A-Z]{2}[A-Z0-9]{3}\)/gi, ''))
      .replace(/\b(?:viet nam|vietnam|united states(?: of america)?|usa)$/, '')
      .trim();
  const left = portName(booking);
  return !!left && left === portName(bill);
}
