const billLabel = String.raw`(?:b\s*/?\s*l|bill\s+of\s+lading|(?:sea\s+)?waybill)\s*(?:no\.?|number|ref\.?|#)|số\s+vận\s+đơn`;
const bookingLabel = String.raw`(?:booking|bkg)\s*(?:no\.?|number|ref\.?|#)|số\s+booking`;
const orderLabel = String.raw`(?:[A-Z]{2,5}['’]S\s+)?(?:p\.?\s*o\.?|purchase\s+order)(?:\s*(?:no\.?|number|#))?`;
const referenceToken = /^[A-Z0-9][A-Z0-9./_-]{2,49}$/i;

export function referenceKey(value = '') {
  return String(value).trim().toUpperCase();
}

function referenceValues(text, label) {
  const pattern = new RegExp(
    `(?:^|[·|\\t]| {2,}|\\bAS PER\\s+)(?:\\s*)(?:${label})(?=[:#\\s]|$)\\s*[:#]?\\s*`,
    'i',
  );
  const lines = String(text).split(/\r?\n/);
  const values = new Set();
  for (const [index, line] of lines.entries()) {
    const match = pattern.exec(line);
    if (!match) continue;
    const rest = line.slice(match.index + match[0].length).trim() || lines[index + 1]?.trim();
    const candidate = rest?.split(/\s|[·|:]/)[0];
    if (candidate && referenceToken.test(candidate) && /\d/.test(candidate))
      values.add(referenceKey(candidate));
  }
  return [...values];
}

function referenceFrom(text, label) {
  const values = referenceValues(text, label);
  return values.length === 1 ? values[0] : '';
}

export function shipmentReferences(text, type) {
  const prefix = type === 'packing' ? 'pl' : type;
  const fields = {
    [prefix + 'BillNo']: referenceFrom(text, billLabel),
    [prefix + 'PurchaseOrder']: referenceValues(text, orderLabel).join('\n'),
  };
  if (type !== 'booking') fields[prefix + 'BookingNo'] = referenceFrom(text, bookingLabel);
  return fields;
}
