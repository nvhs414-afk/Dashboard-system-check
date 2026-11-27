export const freeTimeFields = {
  demFree: 'Free DEM',
  detFree: 'Free DET',
  freeDays: 'DET + DEM (Free time)',
};

const fee = String.raw`(?:DEM(?:URRAGE)?|DET(?:ENTION)?)`;
const days = String.raw`(?:(?:calendar|working)\s+)?(?:free\s+)?days?`;
const pair = String.raw`(?:DEM(?:URRAGE)?\s*(?:[+/&]|and)\s*DET(?:ENTION)?|DET(?:ENTION)?\s*(?:[+/&]|and)\s*DEM(?:URRAGE)?)`;
const combined = String.raw`(?:combined\b|D\s*&\s*D\b|${pair}\b)`;
const prefix = new RegExp(
  String.raw`\b(free\s+)?(${fee})\b\s*(?:free\s*(?:time\s*)?|time\s*)?(?:[:：=–-]\s*)?(\d{1,2})\b(?:\s*(${days}))?`,
  'gi',
);
const suffix = new RegExp(String.raw`\b(\d{1,2})\s*(${days})?\s*(free\s+)?(${fee})\b`, 'gi');
const combinedAfter = new RegExp(
  String.raw`${combined}(?:\s*(?:D\s*&\s*D|\(?\s*free\s*time\s*\)?|combined|days?))*\s*[:：=–-]?\s*(\d{1,2})\b(?:\s*(${days}))?`,
  'i',
);
const combinedBefore = new RegExp(String.raw`\b(\d{1,2})\s+${days}\s+${combined}`, 'i');

function cargoClass(text) {
  const equipment = new Set(
    [
      ...text.matchAll(
        /\bEquipment Type\s*:\s*(Dry Container|Reefer(?: Container)?|Open Top|Flat Rack)\b/gi,
      ),
    ].map((match) => match[1].toLowerCase()),
  );
  if (equipment.size > 1) return '';
  if (/\b(?:DG\s*:\s*Yes|Equipment Type\s*:\s*(?:Open Top|Flat Rack))\b/i.test(text))
    return 'special';
  if (/\b(?:RF\s*:\s*Yes|Equipment Type\s*:\s*Reefer)\b/i.test(text)) return 'reefer';
  return equipment.has('dry container') && /\bDG\s*:\s*No\b/i.test(text) ? 'dry' : '';
}

function ruleClass(clause) {
  const condition = clause.match(/\bfor\s+([^.;]+)/i)?.[1] || '';
  if (/\b(?:dry\s*[-–]?\s*DG|dangerous|open top|flat rack)\b/i.test(condition)) return 'special';
  if (/\b(?:reefer|refrigerated)\b/i.test(condition)) return 'reefer';
  if (/\b(?:DC\s*[-–]?\s*general|general\s+cargo|dry\s+general)\b/i.test(condition)) return 'dry';
  return '';
}

export function bookingFreeTime(text) {
  const scope = cargoClass(text);
  const evidence = [];
  const pages = text.split(/^\s*\[Trang (\d+)\][ \t]*$/m);
  for (let i = 0; i < pages.length; i += 2) {
    const page = i ? Number(pages[i - 1]) : null;
    const clauses = pages[i]
      .replace(
        /\r?\n[ \t]*(?=(?:[+&]|\d{1,2}\s*(?:DEM|DET|days?\b)|for\s+(?:DC|Dry|Reefer)\b))/gi,
        ' ',
      )
      .split(/\r?\n|[.;](?=\s|$)|(?=\bFree\s+\d{1,2}\s*(?:DEM|DET)\b)/gi);
    for (const part of clauses) {
      const quote = part.replace(/\s+/g, ' ').trim();
      if (!quote) continue;
      const rule = ruleClass(quote);
      const add = (field, value) =>
        evidence.push({ field, value, quote, page, applicable: !rule || rule === scope });
      if (/\bas per (?:the )?(?:(?:carrier|line)['’]?s? )?tariff\b|theo biểu phí/i.test(quote)) {
        add('tariff', '');
      }
      // Rates or paired figures without individual labels cannot be split into free days.
      if (/\b(?:USD|VND|EUR|CFS|storage|plug[- ]?in)\b/i.test(quote)) continue;
      if (/\b\d{1,2}\s*[+/]\s*\d{1,2}\b/.test(quote)) {
        if (/\b(?:free\s*time|DEM|DET|D\s*&\s*D)\b/i.test(quote)) add('unclear', '');
        continue;
      }
      const after = quote.match(combinedAfter);
      const before = quote.match(combinedBefore);
      if ((after || before) && !/\bnot\s+combined\b/i.test(quote)) {
        add('freeDays', (after || before)[1]);
        continue;
      }
      for (const [, free, label, count, unit] of quote.matchAll(prefix)) {
        if (free || unit) add(/^dem/i.test(label) ? 'demFree' : 'detFree', count);
      }
      for (const [, count, unit, free, label] of quote.matchAll(suffix)) {
        if (unit || free || /\bfree\b/i.test(quote) || quote.includes('+'))
          add(/^dem/i.test(label) ? 'demFree' : 'detFree', count);
      }
    }
  }
  return evidence.filter(
    (entry, index) =>
      evidence.findIndex(
        (other) =>
          other.field === entry.field &&
          other.value === entry.value &&
          other.page === entry.page &&
          other.quote === entry.quote,
      ) === index,
  );
}

export function resolveFreeTime(evidence) {
  const fields = {};
  for (const field of Object.keys(freeTimeFields)) {
    const values = new Set(
      evidence
        .filter((entry) => entry.field === field && entry.applicable)
        .map((entry) => Number(entry.value)),
    );
    if (values.size === 1) fields[field] = String([...values][0]);
  }
  return fields;
}
