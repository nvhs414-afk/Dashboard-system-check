import { norm } from './field-values.js';

const serviceName =
  /^(?:feeder\s+)?service(?:\s+(?:code|name))?(?:\s*[:：]\s*|\s+)([a-z0-9][a-z0-9-]{1,15})$/i;

export function bookingService(text) {
  const services = new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.trim().match(serviceName)?.[1]?.toUpperCase())
      .filter(Boolean),
  );
  return services.size === 1 ? [...services][0] : '';
}

export const serviceCondition =
  /\bfor\s+(?:the\s+)?(?:feeder\s+)?service(?:\s+(?:code|name))?\s*[:：]?\s*([a-z0-9][a-z0-9-]{1,15})\b/i;

const feeLabels = {
  demFree: /^dem(?:urrage)?$/,
  detFree: /^det(?:ention)?$/,
  freeDays:
    /^(?:combined(?: (?:d d|demurrage(?: and)? detention|dem(?: and)? det|det(?: and)? dem))?|d d|dem(?: and)? det|det(?: and)? dem)$/,
};

function freeTimeColumn(cell) {
  const label = norm(cell)
    .replace(/^free(?: time)?\s+/, '')
    .replace(/\s+(?:free(?: time)?|(?:free )?(?:(?:calendar|working|business) )?days?)$/, '');
  return Object.keys(feeLabels).find((key) => feeLabels[key].test(label));
}

export function serviceFreeTimeRows(text, service) {
  const columns = (line) => line.split(/\s*[|·]\s*|\t+| {2,}/).map((cell) => cell.trim());
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const evidence = [];
  for (const [index, line] of rows.entries()) {
    const header = columns(line);
    if (!/^service(?: (?:name|code))?$/.test(norm(header[0]))) continue;
    const fields = header.map(freeTimeColumn);
    const unitDeclared = header.some(
      (cell, col) => fields[col] && /\b(?:free|days?)\b/i.test(cell),
    );
    const freeTimeHeading =
      /^(?:\d+[/.)]?\s*)?(?:(?:demurrage|detention|dem|det|d d)\s*(?:and\s*(?:demurrage|detention|dem|det)\s*)?)?free time(?: by service)?$/.test(
        norm(rows[index - 1]),
      );
    if ((!unitDeclared && !freeTimeHeading) || /\b(?:tariff|rates?|usd|vnd|eur)\b/i.test(line))
      continue;
    for (const row of rows.slice(index + 1)) {
      const cells = columns(row);
      const code = cells[0].toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9-]{1,15}$/.test(code) || cells.length < 2) break;
      if (cells.length !== header.length) continue;
      for (const [column, field] of fields.entries()) {
        if (!field) continue;
        const count = cells[column]?.match(
          /^(\d{1,3})(?:\s+(?:(?:calendar|working|business) )?days?)?$/i,
        );
        if (count)
          evidence.push({
            field,
            value: count[1],
            service: code,
            applicable: code === service,
            quote: line + ' | ' + row,
          });
      }
    }
  }
  return evidence;
}
