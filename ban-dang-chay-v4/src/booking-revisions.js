export function bookingIssueDate(text) {
  const header = text.split(/\r?\n/).slice(0, 25).join('\n');
  const label =
    /\b(?:print date|issue date|date of issue|booking(?: amendment)? date)[ \t]*:\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/i;
  const match = header.match(label);
  if (!match) return '';
  const [, year, month, day, hour = '00', minute = '00'] = match;
  const clock = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute));
  if (
    clock.getUTCDate() !== +day ||
    clock.getUTCMonth() !== +month - 1 ||
    +hour > 23 ||
    +minute > 59
  )
    return '';
  return clock.toISOString().slice(0, 16);
}

export function selectBookingSources(queue) {
  const ready = queue.filter(
    (item) => item.type === 'booking' && item.status === 'Đã nhận diện' && item.fields,
  );
  const references = [
    ...new Set(ready.map((item) => item.fields.bookingNo?.trim().toUpperCase()).filter(Boolean)),
  ];
  if (references.length > 1 || (!references.length && ready.length > 1)) {
    return { sources: [], fields: {}, mixed: true, conflicts: [], changed: [], older: 0 };
  }
  const compatible = references.length
    ? ready.filter((item) => item.fields.bookingNo?.trim().toUpperCase() === references[0])
    : ready;
  const newest =
    compatible.length > 1 && compatible.every(({ fields }) => fields.bookingIssuedAt)
      ? compatible
          .map(({ fields }) => fields.bookingIssuedAt)
          .sort()
          .at(-1)
      : '';
  const sources = newest
    ? compatible.filter(({ fields }) => fields.bookingIssuedAt === newest)
    : compatible;
  const older = compatible.filter((item) => !sources.includes(item));
  const keys = new Set(sources.flatMap((item) => Object.keys(item.fields)));
  const fields = {};
  const conflicts = [];
  const changed = [];
  for (const key of keys) {
    const values = new Set(sources.map((item) => item.fields[key]).filter(Boolean));
    if (values.size > 1) conflicts.push(key);
    if (values.size !== 1) continue;
    fields[key] = [...values][0];
    if (older.some((item) => item.fields[key] && item.fields[key] !== fields[key]))
      changed.push(key);
  }
  return { sources, fields, mixed: false, conflicts, changed, older: older.length };
}
