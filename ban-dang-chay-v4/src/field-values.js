export function num(s) {
  let raw = String(s ?? '').replace(/[^\d,.-]/g, '');
  if (!raw) return NaN;
  if (raw.includes(',') && raw.includes('.'))
    raw =
      raw.lastIndexOf(',') > raw.lastIndexOf('.')
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw.replace(/,/g, '');
  else if (raw.includes(','))
    raw = /,\d{3}$/.test(raw) ? raw.replace(/,/g, '') : raw.replace(',', '.');
  return Number(raw);
}
export function weightText(value) {
  const text = String(value ?? '')
    .trim()
    .replace(/^(?:kgm|kgs?)\s+/i, '')
    .replace(/\s*(?:kgm|kgs?)$/i, '');
  return /^\d[\d.,]*$/.test(text) && Number.isFinite(num(text)) ? text : '';
}
export function formatUsd(value) {
  if (!/^-?\d[\d.,]*$/.test(value)) return value;
  const comma = value.lastIndexOf(',');
  const dot = value.lastIndexOf('.');
  const commaIsDecimal =
    comma > dot && (dot >= 0 || (value.indexOf(',') === comma && value.length - comma !== 4));
  const decimal = commaIsDecimal
    ? value.replace(/\./g, '').replace(',', '.')
    : value.replace(/,/g, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(decimal)) return value;
  const [whole, fraction] = decimal.split('.');
  const grouped = whole.replace(/\B(?=(?:\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}
export function norm(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
export function eq(a, b, numeric = false) {
  if (numeric) {
    const x = num(a),
      y = num(b);
    return (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Math.abs(x - y) <= Math.max(0.1, Math.max(x, y) * 0.001)
    );
  }
  return !!(norm(a) && norm(b)) && norm(a) === norm(b);
}
export function date(v) {
  if (!v) return null;
  let m = String(v).match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = String(v).match(/(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
}
export function formatDate(v) {
  const d = date(v);
  return d
    ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
    : v || '—';
}
