import { textBlocks, textRows } from './pdf-layout.js';

const transportHeading = /^Intended Transport Plan$/i;
const itineraryHeading = /^Load Itinerary$/i;
const date = String.raw`\d{4}-\d{2}-\d{2}`;
const sailingDate = new RegExp(`^${date}(?: \\d{2}:\\d{2})?$`);
const routeHeaders = ['From', 'To', 'Mode', 'Vessel', 'Voy No.', 'ETD', 'ETA'];

function transportLegs(rows, plan, itinerary) {
  const table = rows.slice(plan + 1, itinerary > plan ? itinerary : undefined);
  const heading = (text) => text.replace(/[^a-z]/gi, '').toLowerCase();
  const header = table.findIndex(({ blocks }) =>
    routeHeaders.every((label, column) => heading(blocks[column]?.text || '') === heading(label)),
  );
  if (header < 0) return [];

  const boundaries = table[header].blocks.slice(0, routeHeaders.length).map(({ x }) => x - 2);
  const legs = [];
  for (const row of table.slice(header + 1)) {
    const [from, to, mode, vessel, voyage, etd, eta] = boundaries.map((left, column) =>
      textBlocks(
        row.spans.filter(({ x }) => x >= left && x < (boundaries[column + 1] ?? Infinity)),
        true,
      )
        .map(({ text }) => text)
        .join(' '),
    );
    if ((from || to) && mode && (sailingDate.test(etd) || sailingDate.test(eta))) {
      legs.push({
        from,
        to,
        mode,
        etd: sailingDate.test(etd) ? etd : '',
        eta: sailingDate.test(eta) ? eta : '',
      });
    } else if (legs.length && (from || to) && !mode && !vessel && !voyage && !etd && !eta) {
      const leg = legs.at(-1);
      if (from) leg.from = [leg.from, from].filter(Boolean).join(' ');
      if (to) leg.to = [leg.to, to].filter(Boolean).join(' ');
    } else if (legs.length) break;
  }
  return legs;
}

function location(value) {
  return value?.replace(/\s*,\s*/g, ', ').trim() || '';
}

function routeFields(legs, origin, destination, serviceMode) {
  const marine = legs.filter(({ mode }) => /^(?:MVS|vessel|ocean|sea)$/i.test(mode));
  const first = marine[0];
  const last = marine.at(-1);
  const startsAtTerminal = first && /^CY\s*\//i.test(serviceMode) && first === legs[0];
  const endsAtTerminal = last && /\/\s*CY$/i.test(serviceMode) && last === legs.at(-1);
  const [firstLeg, secondLeg] = legs;
  return {
    bookingReceipt: location(origin),
    bookingPol: startsAtTerminal && origin ? location(origin).split(',')[0] : location(first?.from),
    bookingPolTml: location(first?.from),
    bookingDischarge:
      endsAtTerminal && destination ? location(destination).split(',')[0] : location(last?.to),
    bookingDischargeTml: location(last?.to),
    bookingPod: location(destination),
    bookingPodTml: endsAtTerminal ? location(last?.to) : '',
    etd: firstLeg?.etd,
    etdConnect: secondLeg?.etd !== firstLeg?.etd ? secondLeg?.etd : '',
    etaFirst: firstLeg?.eta,
    etaSecond: secondLeg?.eta !== firstLeg?.eta ? secondLeg?.eta : '',
  };
}

function cutoffFields(text, service, destination, legs) {
  const weekday = String.raw`(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)`;
  const weeklyTime = String.raw`${weekday}\s+\d{1,2}:\d{2}\s*[AP]M`;
  const rows = text.split(/\r?\n/);
  const cutoffRow = new RegExp(
    `^${service}\\s+${weekday}\\s+(${weeklyTime})\\s+(${weeklyTime}|None)$`,
    'i',
  );
  const match = service && rows.map((row) => row.match(cutoffRow)).find(Boolean);
  const note = ` (lịch tham chiếu ${service})`;
  const standardSi = rows.find((row) => /^\*?Other destinations\s*:/i.test(row));
  const usRoute =
    /\bUnited States\b/i.test(destination || '') &&
    !legs.some(({ from, to }) =>
      /\b(?:Japan|Tokyo|Yokohama|Nagoya|Kobe|Osaka|Hakata)\b/i.test(from + ' ' + to),
    );
  return {
    cyCutoff: match ? match[1] + note : '',
    icdCutoff: match && !/^none$/i.test(match[2]) ? match[2] + note : '',
    siCutoff: usRoute
      ? standardSi?.match(/:\s*(\d+\s*(?:hrs?|hours?)\s+before\s+CY\s+Cut[- ]?off)/i)?.[1] || ''
      : '',
  };
}

function positionedRows(items) {
  return textRows(items).map((row) => {
    const blocks = textBlocks(row.spans, true);
    return { ...row, blocks, text: blocks.map((block) => block.text).join('  ') };
  });
}

export function readMaerskBooking(pages) {
  if (!pages.length) return;
  const first = positionedRows(pages[0]);
  const plan = first.findIndex((row) => transportHeading.test(row.text));
  if (
    plan < 0 ||
    !first
      .slice(0, plan)
      .some((row) => /^Booking (?:Amendment|Confirmation|Note|Notice)$/i.test(row.text))
  )
    return;

  const layouts = [first, ...pages.slice(1).map(positionedRows)];
  const itinerary = first.findIndex((row) => itineraryHeading.test(row.text));
  const header = first
    .slice(0, plan)
    .map((row) => row.text)
    .join('\n');
  const text = layouts
    .map((rows, page) => `[Trang ${page + 1}]\n${rows.map((row) => row.text).join('\n')}`)
    .join('\n');
  const serviceMode = header.match(/\bService Mode:\s*([A-Z]+\s*\/\s*[A-Z]+)/i)?.[1] || '';
  const origin = header.match(/\bFrom:[ \t]*([^\r\n]+)/i)?.[1];
  const destination = header.match(/\bTo:[ \t]*([^\r\n]+)/i)?.[1];
  const service = header.match(/^Service\s+([A-Z0-9-]+)\s*$/im)?.[1].toUpperCase();
  const legs = transportLegs(first, plan, itinerary);
  const pickupRow =
    itinerary < 0
      ? ''
      : first.slice(itinerary + 1).find((row) => /^Empty Container\b/i.test(row.text))?.text || '';
  const pickup = pickupRow.match(
    new RegExp(`^Empty Container(?: Depot)?\\s+(.+?)\\s+(${date})(?:\\s+(\\d{2}:\\d{2}))?`, 'i'),
  );
  const fields = {
    bookingNo: header.match(/\bBooking\s+(?:No\.?|Number)\s*:?\s*([A-Z0-9][A-Z0-9-]*)/i)?.[1],
    ...routeFields(legs, origin, destination, serviceMode),
    ...cutoffFields(text, service, destination, legs),
    bookingPickupCy: location(pickup?.[1]),
    pickupDate: pickup ? [pickup[2], pickup[3]].filter(Boolean).join(' ') : '',
  };
  return { text, fields: Object.fromEntries(Object.entries(fields).filter(([, value]) => value)) };
}
