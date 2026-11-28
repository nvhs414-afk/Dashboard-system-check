export function textRows(items) {
  const spans = items
    .filter((item) => item.str?.trim() && item.transform)
    .map(({ str, transform: [, , , , x, y], width, height }) => ({
      text: str.trim(),
      x,
      y,
      end: x + width,
      height,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const span of spans) {
    const row = rows.at(-1);
    if (row && row.y - span.y <= 2) row.spans.push(span);
    else rows.push({ y: span.y, spans: [span] });
  }
  return rows;
}

export function textBlocks(spans, joinFragments = false) {
  const blocks = [];
  for (const span of spans.sort((a, b) => a.x - b.x)) {
    const previous = blocks.at(-1);
    const gap = previous ? span.x - previous.end : Infinity;
    if (gap <= Math.max(5, span.height, previous?.height || 0)) {
      previous.text += (joinFragments && gap < 0.75 ? '' : ' ') + span.text;
      previous.end = Math.max(previous.end, span.end);
    } else blocks.push({ ...span });
  }
  return blocks;
}
