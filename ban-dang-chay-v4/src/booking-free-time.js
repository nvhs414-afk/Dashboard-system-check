import { norm } from './field-values.js';

export const freeTimeFields = {
  demFree: 'Free DEM',
  detFree: 'Free DET',
  freeDays: 'DET + DEM (Free time)',
};

const fee = String.raw`(?:DEM(?:URRAGE)?|DET(?:ENTION)?)`;
const days = String.raw`(?:(?:calendar|working|business)\s+)?(?:free\s+)?days?`;
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

function cargoProfile(text) {
  const equipment = new Set(
    [
      ...text.matchAll(
        /\bEquipment Type\s*:\s*(Dry Container|Reefer(?: Container)?|Open Top|Flat Rack)\b/gi,
      ),
    ].map((match) => match[1].toLowerCase()),
  );
  const descriptions = new Map();
  for (const [, row] of text.matchAll(
    /\bCommodity\s+(?:Desc\.?|Description)\s*[:：][ \t]*([^\r\n]+)/gi,
  )) {
    const description = row
      .split(/\s+(?:Flex\s*EQ|DG|RF|Gross WGT|Measurement|PKG-Count)\s*[:：]/i)[0]
      .trim();
    if (description) descriptions.set(norm(description), description);
  }
  const commodity = descriptions.size === 1 ? [...descriptions.values()][0] : '';
  const name = norm(commodity);
  const dgYes = /\bDG\s*:\s*Yes\b/i.test(text);
  const dgNo = /\bDG\s*:\s*No\b/i.test(text);
  const rfYes = /\bRF\s*:\s*Yes\b/i.test(text);
  const rfNo = /\bRF\s*:\s*No\b/i.test(text);
  const describedDg =
    /\b(?:dangerous goods|hazardous goods|hazardous cargo|dg cargo)\b/.test(name) &&
    !/\bnon\s*(?:dangerous|hazardous|dg)\b/.test(name);
  const describedRf = /\b(?:refrigerated|frozen|temperature controlled)\b/.test(name);
  const specialEquipment = equipment.has('open top') || equipment.has('flat rack');
  const reefer = rfYes || equipment.has('reefer') || equipment.has('reefer container');
  const dry = equipment.has('dry container');

  const conflicting =
    equipment.size > 1 ||
    (dgNo && (dgYes || describedDg)) ||
    (rfNo && (reefer || describedRf)) ||
    (dry && (reefer || describedRf)) ||
    ((dgYes || describedDg || specialEquipment) && (reefer || describedRf));
  if (conflicting) return { commodity, scope: '', conflicting };

  let scope = '';
  if (dgYes || describedDg || specialEquipment) scope = 'special';
  else if (reefer || describedRf) scope = 'reefer';
  else if (dry && dgNo) scope = 'dry';
  return { commodity, scope, conflicting };
}

function ruleApplies(clause, { commodity, scope, conflicting }) {
  if (conflicting) return false;
  const condition = clause.match(/\bfor\s+([^;:：()]+)/i)?.[1] || '';
  if (!condition || /^(?:(?:this|the)\s+(?:shipment|booking)|all\s+cargo)\s*$/i.test(condition))
    return true;

  const [policy, exception] = norm(condition).split(/\b(?:except|excluding)\b/);
  const description = norm(commodity);
  const matchesCommodity = (text) => {
    const goods = text
      .trim()
      .replace(/\s+(?:cargo|goods|shipments?|only)\b/g, '')
      .trim();
    return !!goods && (' ' + description + ' ').includes(' ' + goods + ' ');
  };
  if (exception && (!description || matchesCommodity(exception))) return false;
  if (/\b(?:dry\s*dg|dangerous|open top|flat rack)\b/.test(policy)) return scope === 'special';
  if (/^(?:reefer|refrigerated)(?: (?:cargo|containers?))?$/.test(policy.trim()))
    return scope === 'reefer';
  if (/^(?:dc ?general|general cargo|dry general)(?: cargo)?$/.test(policy.trim()))
    return scope === 'dry';
  return matchesCommodity(policy);
}

export function bookingFreeTime(text) {
  const cargo = cargoProfile(text);
  const evidence = [];
  const pages = text.split(/^\s*\[Trang (\d+)\][ \t]*$/m);
  for (let i = 0; i < pages.length; i += 2) {
    const page = i ? Number(pages[i - 1]) : null;
    const clauses = pages[i]
      .replace(/\r?\n[ \t]*(?=(?:[+&]|\d{1,2}\s*(?:DEM|DET|days?\b)|for\b))/gi, ' ')
      .replace(/([^\s:：])[^\S\r\n]+(?=Free\s+\d{1,2}\s*(?:DEM|DET)\b)/gi, '$1\n')
      .split(/\r?\n|[.;](?=\s|$)/);
    for (const part of clauses) {
      const quote = part.replace(/\s+/g, ' ').trim();
      if (!quote) continue;
      const applicable = ruleApplies(quote, cargo);
      const add = (field, value) =>
        evidence.push({
          field,
          value,
          quote,
          page,
          commodity: cargo.commodity,
          applicable,
        });
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
