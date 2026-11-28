import { norm } from './field-values.js';

const excludedTitle =
  /^(?:to khai(?: hang hoa| hai quan| xuat khau| nhap khau)*|customs declaration|danh sach giam sat|ds container|certificate of origin|chung nhan xuat xu|(?:sales?|purchase) contract|purchase order|hop dong(?: mua ban)?|shipping instructions?|si|arrival notice|giay bao hang den|verified gross mass|vgm(?: declaration)?|dinh muc|material consumption)(?:$| no\b| form\b)|^(?:danh sach|bang ke) container\b.*\b(?:hai quan|giam sat)\b/;
const documents = {
  booking: {
    title:
      /^(?:booking (?:confirmation|notice|note|amendment)|book confirmation|xac nhan dat cho)(?:$| no\b| draft\b| copy\b)/,
    signs: [
      /\b(?:booking|bkg) (?:no|number|ref)\b/,
      /\bcut off\b/,
      /\btransport plan\b/,
      /\bempty (?:container|depot|pick up)\b/,
      /\bet[ad]\b/,
      /\bvessel voyage\b/,
    ],
  },
  bl: {
    title:
      /^(?:bill of lading|sea waybill|non negotiable waybill|ocean bill of lading|master bill of lading|house bill of lading|van don duong bien)(?:$| no\b| draft\b| copy\b| original\b)/,
    signs: [
      /\b(?:b l|bl|waybill) (?:no|number)\b/,
      /\bshipped on board\b/,
      /\bfreight (?:prepaid|collect)\b/,
      /\bnotify party\b/,
      /\bcontainer no\b/,
      /\bport of (?:loading|discharge)\b/,
    ],
  },
  invoice: {
    title: /^(?:commercial invoice|invoice|hoa don thuong mai)(?:$| draft\b| copy\b| original\b)/,
    signs: [
      /\b(?:invoice (?:no|number)|so hoa don)\b/,
      /\b(?:unit price|don gia)\b/,
      /\b(?:amount|tri gia|thanh tien)\b/,
      /\b(?:incoterms|fob|cif|exw)\b/,
      /\b(?:usd|eur|vnd)\b/,
      /\b(?:invoice date|ngay hoa don)\b/,
    ],
  },
  packing: {
    title: /^(?:packing list|packing details|pack list|phieu dong goi)(?:$| no\b| draft\b| copy\b)/,
    signs: [
      /\b(?:n w|net weight|trong luong tinh)\b/,
      /\b(?:g w|gross weight|trong luong ca bi)\b/,
      /\b(?:cbm|measurement)\b/,
      /\b(?:ctns?|cartons?|so thung)\b/,
      /\b(?:quantity|so luong)\b/,
      /\b(?:description of goods|ten hang)\b/,
    ],
  },
};

function filenameHint(name) {
  const file = norm(String(name).split(/[\\/]/).pop());
  if (/\b(?:bill(?: of lading)?|b l|bl|waybill|hbl|mbl|van don)\b/.test(file)) return 'bl';
  if (/\b(?:packing|pack list|p l|pl|phieu dong goi)\b/.test(file)) return 'packing';
  if (/\b(?:invoice|hoa don|ci)\b/.test(file)) return 'invoice';
  if (/\b(?:booking|book confirmation|xac nhan dat cho)\b/.test(file)) return 'booking';
  return 'other';
}

function filenameExclusion(name) {
  const file = String(name).split(/[\\/]/).pop();
  const normalized = norm(file);
  if (/giam sat|\bds\s*container\b/.test(normalized))
    return 'Danh sách container hoặc giám sát hải quan.';
  if (/to\s*khai|customs declaration|vnaccs/.test(normalized)) return 'Tờ khai hải quan.';
  if (
    /certificate of origin|chung nhan xuat xu/.test(normalized) ||
    /^(?:co|c[\s_-]+o)\.[a-z0-9]+$/i.test(file)
  )
    return 'Chứng nhận xuất xứ.';
  if (/\b(?:dinh muc|dm\d*|material consumption)\b/.test(normalized)) return 'Bảng định mức.';
  return '';
}

export function isOutOfScopeFilename(name) {
  return Boolean(filenameExclusion(name));
}

function titleCells(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\[(?:Trang|Page) \d+\]$|^Tên sheet:/i.test(line))
    .slice(0, 12)
    .map((line) => line.split(/[\t·|]+| {2,}/).map(norm));
}

export function recognizeDocument(name, text) {
  let headingTypes = [];
  for (const cells of titleCells(text)) {
    headingTypes = Object.entries(documents).filter(([, { title }]) =>
      cells.some((cell) => title.test(cell)),
    );
    if (headingTypes.length) break;
    const excluded = cells.find((cell) => excludedTitle.test(cell));
    if (excluded) {
      const reason =
        filenameExclusion(name) ||
        (/^(?:(?:sales?|purchase) contract|hop dong)\b/.test(excluded)
          ? 'Hợp đồng mua bán.'
          : 'Loại chứng từ ngoài phạm vi đối chiếu.');
      return { type: 'other', score: 5, heading: true, status: 'excluded', reason };
    }
  }
  const excluded = filenameExclusion(name);
  if (!headingTypes.length && excluded) {
    return { type: 'other', score: 0, heading: false, status: 'excluded', reason: excluded };
  }

  const body = norm(text);
  const scores = (headingTypes.length ? headingTypes : Object.entries(documents)).map(
    ([type, rules]) => ({
      type,
      heading: headingTypes.length > 0,
      score:
        (headingTypes.length ? 5 : 0) + rules.signs.filter((pattern) => pattern.test(body)).length,
    }),
  );
  scores.sort((a, b) => b.score - a.score);
  const [best, next] = scores;
  if (best.score >= 5 && best.score > (next?.score ?? 0)) return { ...best, status: 'recognized' };
  const hint = filenameHint(name);
  return {
    type: best.score > (next?.score ?? 0) ? best.type : hint,
    score: best.score,
    heading: false,
    status: 'review',
  };
}

export function sourceType(name, text = '') {
  if (!text.trim()) return isOutOfScopeFilename(name) ? 'other' : filenameHint(name);
  const recognized = recognizeDocument(name, text);
  return recognized.status === 'recognized' ? recognized.type : 'other';
}
