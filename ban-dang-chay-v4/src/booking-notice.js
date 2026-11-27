import { date, norm, weightText } from './field-values.js';

const timeStamp = String.raw`(?:\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})(?:[ \t]+\d{1,2}:\d{2})?`;

function dateAfter(text, label) {
  return text.match(new RegExp(`(?:${label})[ \\t]*[:：]?[ \\t]*(${timeStamp})`, 'i'))?.[1] || '';
}

function shippingInformation(text) {
  const start =
    text.match(/^[ \t]*Shipping Information[ \t]*$/im) ||
    text.match(/^[ \t]*Booking Information[ \t]*$/im);
  const section = start ? text.slice(start.index + start[0].length) : text;
  return section.split(
    /^[ \t]*(?:(?:Cargo Information|Special Cargo Information|Special Instructions|Estimated Cut[- ]?off Information)\b|\[Trang \d+\])/im,
  )[0];
}

function portField(text, label) {
  const match = text.match(
    new RegExp(
      `^[ \\t]*(?:${label})[ \\t]*\\*?[ \\t]*[:：][ \\t]*([^\\r\\n]*)(?:\\r?\\n[ \\t]*((?:TML|Terminal)[ \\t]*[:：][^\\r\\n]*))?`,
      'im',
    ),
  );
  if (!match) return {};
  const row = [match[1], match[2]].filter(Boolean).join(' ');
  const nextField = /(?:^|\s+)(?:TML|Terminal|Facility Code|Trans Mode|ETA|ETD)\s*[:：]/i;
  const place = row
    .split(nextField)[0]
    .trim()
    .replace(/[,;]+$/, '')
    .replace(/\s*\(/g, ' (');
  const terminal = row
    .match(/\b(?:TML|Terminal)\s*[:：]\s*(.+)/i)?.[1]
    .split(nextField)[0]
    .trim();
  return { row, place, terminal };
}

function timestampKey(value) {
  const day = date(value);
  const time = value.match(/\b(\d{1,2}):(\d{2})\b/);
  return day ? `${day.getTime()}/${time ? Number(time[1]) + ':' + time[2] : ''}` : value;
}

function scheduleTimes(section, kind, direct, firstPort, finalPort, connecting) {
  const label =
    kind === 'ETD'
      ? String.raw`\b(?:ETD|Estimated Time of Departure)\b`
      : String.raw`\b(?:ETA|Estimated Time of Arrival)\b`;
  const numbered = (number, ordinal) =>
    dateAfter(
      section,
      String.raw`(?:${label}[ \t]*(?:\([ \t]*)?(?:chặng[ \t]*${number}|leg[ \t]*${number}|${ordinal}[ \t]+leg|${number})(?:[ \t]*\))?|(?:leg[ \t]*${number}|chặng[ \t]*${number}|${ordinal}[ \t]+leg)[ \t:-]+${label})`,
    );
  const explicitFirst =
    numbered(1, '1st') ||
    (kind === 'ETA' ? dateAfter(section, String.raw`\bETA[ \t]+(?:first[ \t]+leg|Yangshan)`) : '');
  const explicitSecond =
    numbered(2, '2nd') ||
    (kind === 'ETD'
      ? dateAfter(section, String.raw`(?:Connection|Transshipment)[ \t]+ETD|ETD[ \t]+Connecting`)
      : '');
  const candidates = [
    ...section.matchAll(new RegExp(`${label}[ \\t]*[:：]?[ \\t]*(${timeStamp})`, 'gi')),
  ].map((match) => match[1]);
  const atOriginOrDischarge = dateAfter(firstPort || '', label);
  const atFinal = dateAfter(finalPort || '', label);
  const differentFrom = (a, b) => !b || timestampKey(a) !== timestampKey(b);
  const finalArrival = kind === 'ETA' && connecting ? atOriginOrDischarge || atFinal : '';
  const finalDelivery = kind === 'ETA' && connecting ? atFinal : '';
  // Discharge and delivery timestamps belong to the destination on a connecting route.
  const first =
    explicitFirst ||
    (direct
      ? atOriginOrDischarge || candidates[0]
      : candidates.find(
          (time) =>
            differentFrom(time, explicitSecond) &&
            differentFrom(time, finalArrival) &&
            differentFrom(time, finalDelivery),
        )) ||
    '';
  const second =
    explicitSecond ||
    finalArrival ||
    (!direct ? candidates.find((time) => differentFrom(time, first)) : '') ||
    '';
  return [first, second && differentFrom(second, first) ? second : ''];
}

export function bookingNoticeFields(text) {
  const section = shippingInformation(text);
  const receipt = portField(section, String.raw`Place\s+of\s+Receipt`);
  const loading = portField(section, String.raw`Port\s+of\s+Loading|POL`);
  const discharge = portField(section, String.raw`Port\s+of\s+Discharg(?:e|ing)`);
  const delivery = portField(section, String.raw`(?:Final\s+)?Place\s+of\s+Delivery|POD`);
  const laterVoyages = [
    ...section.matchAll(/^[ \t]*(?:2nd|3rd)\s+Vessel\s*\/\s*Voyage\s*:[ \t]*([^\r\n]*)/gim),
  ];
  const connecting = laterVoyages.some(([, value]) =>
    value.split(/\b(?:T\/S Port|Call Sign)\s*:/i)[0].trim(),
  );
  const direct = laterVoyages.length > 0 && !connecting;
  const [etd, etdConnect] = scheduleTimes(section, 'ETD', direct, loading.row);
  const [etaFirst, etaSecond] = scheduleTimes(
    section,
    'ETA',
    direct,
    discharge.row,
    delivery.row,
    connecting,
  );
  const gross = text.match(/\bGross\s+(?:WGT\.?|Weight)\s*[:：]\s*(\d[\d.,]*\s*(?:kgm|kgs?)\b)/i);

  return {
    bookingReceipt: receipt.place,
    bookingReceiptTml: receipt.terminal,
    bookingPol: loading.place,
    bookingPolTml: loading.terminal,
    bookingDischarge: discharge.place,
    bookingDischargeTml: discharge.terminal,
    bookingPod: delivery.place,
    bookingPodTml: delivery.terminal,
    etd,
    etdConnect,
    etaFirst,
    etaSecond,
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
