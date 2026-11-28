import { $, toast } from './dom.js';
import { fields, groups, types } from './document-fields.js';
import { bookingFreeTimeEvidence, state } from './session.js';
import { freeTimeFields, resolveFreeTime } from './booking-free-time.js';
import { renderQueue, renderForm } from './document-view.js';
import { renderComparisonTable } from './results-view.js';
import { invalidateResult, runChecks } from './review.js';
import {
  allowedExt,
  extension,
  readDocument,
  readSpreadsheetSheets,
  unzipDocuments,
} from './readers.js';
import { extractFields } from './extraction.js';
import { sourceType, recognizeDocument } from './document-recognition.js';
import { extractBillOfLadingFields } from './bill-of-lading.js';
import { readMaerskBooking } from './maersk-booking.js';
import { pdfDocuments } from './pdf-documents.js';
import { selectBookingSources } from './booking-revisions.js';

export function queueFiles(files) {
  if (state.scanning) {
    toast('Hãy chờ quét xong trước khi thêm tệp.');
    return;
  }
  let duplicates = 0,
    added = 0,
    unfamiliar = 0;
  for (const file of files) {
    const ext = extension(file.name);
    if (!allowedExt.has(ext)) unfamiliar++;
    const id = `${file.name}|${file.size}|${file.lastModified}`;
    if (state.seen.has(id)) {
      duplicates++;
      continue;
    }
    state.seen.add(id);
    state.queue.push({
      key: id,
      file,
      name: file.name,
      kind: ext,
      type: ext === 'zip' ? 'zip' : sourceType(file.name),
      status: 'Chờ quét',
      fields: {},
      error: '',
      depth: 0,
    });
    added++;
  }
  state.notice = [
    added ? `Đã thêm ${added} tệp.` : '',
    unfamiliar
      ? `${unfamiliar} tệp chưa có bộ đọc sẽ được đánh dấu cần xác minh sau khi quét.`
      : '',
    duplicates ? `Bỏ qua ${duplicates} tệp trùng tên, kích thước và ngày sửa.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  invalidateResult();
  renderQueue();
  renderForm(runChecks);
  if (unfamiliar || duplicates) toast(state.notice);
}
function syncExtractedForm() {
  const booking = selectBookingSources(state.queue);
  const next = { ...booking.fields };
  for (const type of groups) {
    if (type === 'booking') continue;
    const sources = state.queue
      .filter((item) => item.type === type && item.status === 'Đã nhận diện')
      .sort((a, b) => Object.keys(b.fields).length - Object.keys(a.fields).length);
    const referenceField = { invoice: 'invoiceNo', packing: 'plInvoiceNo', bl: 'blBillNo' }[type];
    const reference = sources[0]?.fields[referenceField]?.toUpperCase();
    const compatible = reference
      ? sources.filter((item) => item.fields[referenceField]?.toUpperCase() === reference)
      : sources.slice(0, 1);
    for (const item of compatible)
      for (const [key, val] of Object.entries(item.fields)) if (val && !next[key]) next[key] = val;
  }
  const freeTime = resolveFreeTime(bookingFreeTimeEvidence(booking.sources));
  for (const key of Object.keys(freeTimeFields)) {
    if (freeTime[key]) next[key] = freeTime[key];
    else delete next[key];
  }
  for (const key of state.manual) next[key] = state.form[key] ?? '';
  state.form = next;
}
async function expandZip(item) {
  if (item.depth >= 3) throw Error('ZIP lồng quá 3 cấp; cần giải nén thủ công.');
  const { files, skipped } = await unzipDocuments(item.file);
  if (!files.length) throw Error('ZIP trống hoặc các tệp bên trong vượt 60 MB.');
  const children = files.map(({ entry, file }) => ({
    key: item.key + ':' + entry,
    file,
    name: `${item.name}/${entry}`,
    kind: extension(file.name),
    type: extension(file.name) === 'zip' ? 'zip' : sourceType(file.name),
    status: 'Chờ quét',
    fields: {},
    error: '',
    depth: item.depth + 1,
  }));
  state.queue.splice(state.queue.indexOf(item), 1, ...children);
  if (skipped.length) {
    state.notice = `Bỏ qua ${skipped.length} mục trong ZIP vượt 60 MB.`;
    toast(state.notice);
  }
  return children;
}
async function expandSpreadsheet(item) {
  const sheets = await readSpreadsheetSheets(item.file);
  if (!sheets.length) throw Error('Bảng tính không có sheet để đọc.');
  return sheets.map((sheet, index) => ({
    key: `${item.key}:sheet:${index}`,
    file: item.file,
    name: `${item.name}/${sheet.name}`,
    sheetName: sheet.name,
    sheetText: sheet.text,
    sheetRows: sheet.rows,
    kind: 'sheet',
    type: sourceType(sheet.name, sheet.text),
    status: 'Chờ quét',
    fields: {},
    error: '',
    depth: item.depth,
  }));
}

function billFieldsFromPages(pages) {
  const extracted = pages.map(extractBillOfLadingFields);
  const fields = Object.assign({}, ...extracted.slice().reverse());
  const collect = (key) => new Set(extracted.map((page) => page[key]).filter(Boolean));
  if (collect('blContainer').size > 1 || collect('blSeal').size > 1)
    fields.blIdentifierConflict = true;
  const orders = new Set(
    extracted.flatMap((page) => (page.blPurchaseOrder || '').split('\n')).filter(Boolean),
  );
  if (orders.size) fields.blPurchaseOrder = [...orders].join('\n');
  return fields;
}

async function expandPdf(item) {
  const pages = [];
  await readDocument(item.file, 'pdf', { onPage: (page) => pages.push(page) });
  const documents = pdfDocuments(item.file.name, pages);
  if (!documents.length) throw Error('PDF không có trang đọc được.');
  return documents.map((document) => {
    const first = document.pages[0].number;
    const last = document.pages.at(-1).number;
    const range = first === last ? String(first) : `${first}–${last}`;
    return {
      ...item,
      key: `${item.key}:pdf:${first}`,
      name: documents.length > 1 ? `${item.name} · Trang ${range}` : item.name,
      sourceName: item.name,
      kind: 'pdf-section',
      type: document.recognition.type,
      status: 'Chờ quét',
      pdf: document,
    };
  });
}

async function readQueueItem(item) {
  const pages = item.pdf?.pages || [];
  const native = pages.map((page) => page.native);
  const recognized = pages.map((page) => page.recognized);
  const pageNumbers = pages.map((page) => page.number);
  const maersk =
    readMaerskBooking(native, pageNumbers) || readMaerskBooking(recognized, pageNumbers);
  let text =
    maersk?.text ??
    (item.pdf
      ? pages.map((page) => `[Trang ${page.number}]\n${page.text}`).join('\n')
      : (item.sheetText ?? (await readDocument(item.file, item.kind))));
  item.raw = maersk?.text ?? item.pdf?.layout ?? text;
  const emptySheet =
    item.kind === 'sheet' &&
    !item.sheetRows.some((row) => row.some((cell) => String(cell ?? '').trim()));
  const recognition = emptySheet
    ? { type: 'other', status: 'excluded', reason: 'Sheet trống.' }
    : (item.pdf?.recognition ?? recognizeDocument(item.file.name, text));
  item.recognition = recognition;
  item.type = maersk ? 'booking' : recognition.type;
  if (recognition.status === 'excluded') {
    item.status = 'Bỏ qua';
    item.fields = {};
  } else if (!text.trim()) {
    throw Error('Không đọc được nội dung; kiểm tra chất lượng tệp hoặc nhập tay.');
  } else if (!maersk && recognition.status !== 'recognized') {
    throw Error(
      item.type === 'other'
        ? 'Chưa đủ nội dung để xác định đây là CI, PL, Booking hay B/L.'
        : `Có dấu hiệu của ${types[item.type]} nhưng chưa đủ nội dung để xác nhận.`,
    );
  } else {
    const bill = item.type === 'bl';
    const positionedFields = bill
      ? { ...billFieldsFromPages(recognized), ...billFieldsFromPages(native) }
      : maersk?.fields || {};
    const layoutFields = item.pdf && !maersk ? extractFields(item.type, item.pdf.layout) : {};
    item.fields = {
      ...layoutFields,
      ...extractFields(item.type, text, item.sheetRows),
      ...positionedFields,
    };
    const billFields = ['blExporter', 'blImporter', 'blPol', 'blPod', 'blGross'];
    if (!item.fields.blIdentifierConflict) billFields.push('blContainer', 'blSeal');
    const needsOcr = bill
      ? billFields.some((field) => !item.fields[field])
      : Object.keys(item.fields).length < 3;
    if (item.pdf && needsOcr) {
      try {
        $('progressText').textContent = `Đang OCR bổ sung ${item.name}`;
        const extraPages = [];
        const ocrText = await readDocument(item.file, 'pdf', {
          forceOcr: true,
          pageNumbers,
          onPage: (page) => extraPages.push(page.recognized),
        });
        const extraFields = bill ? billFieldsFromPages(extraPages) : {};
        const expanded = {
          ...item.fields,
          ...extractFields(item.type, text + '\n' + ocrText),
          ...extraFields,
          ...positionedFields,
        };
        if (
          Object.keys(expanded).length > Object.keys(item.fields).length ||
          Object.keys(extraFields).length
        ) {
          text += '\n' + ocrText;
          item.raw += '\n' + ocrText;
          item.fields = expanded;
        }
      } catch (e) {
        item.ocrNote = `OCR bổ sung chưa hoàn tất: ${e.message || 'không đọc được ảnh'}`;
      }
    }
    const prefix = item.type === 'packing' ? 'pl' : item.type;
    if (item.fields[prefix + 'IdentifierConflict']) {
      delete item.fields[prefix + 'Container'];
      delete item.fields[prefix + 'Seal'];
    }
    if (!fields[item.type]?.some(([key]) => item.fields[key]))
      throw Error(
        item.ocrNote ||
          'Nhận diện được loại chứng từ nhưng chưa trích được trường; hãy kiểm tra và nhập tay.',
      );
    item.status = 'Đã nhận diện';
  }
}

export async function scan() {
  if (state.scanning || !state.queue.length) return;
  state.scanning = true;
  let total = state.queue.filter(
      (item) => !['Đã nhận diện', 'Bỏ qua'].includes(item.status),
    ).length,
    done = 0;
  const bar = $('progressBar'),
    track = $('progressWrap').querySelector('[role="progressbar"]');
  $('progressWrap').hidden = false;
  bar.style.width = '0%';
  renderQueue();
  for (let i = 0; i < state.queue.length; i++) {
    const item = state.queue[i];
    if (['Đã nhận diện', 'Bỏ qua'].includes(item.status)) continue;
    item.status = 'Đang xử lý';
    item.error = '';
    renderQueue();
    $('progressText').textContent = `Đang đọc ${item.name} (${done + 1}/${total})`;
    try {
      if (item.kind === 'zip') {
        const children = await expandZip(item);
        total += children.length - 1;
        i--;
        continue;
      } else if (item.kind === 'pdf' || ['xlsx', 'xls', 'xlsm', 'csv'].includes(item.kind)) {
        const children = await (item.kind === 'pdf' ? expandPdf(item) : expandSpreadsheet(item));
        state.queue.splice(i, 1, ...children);
        total += children.length - 1;
        i--;
        continue;
      } else {
        await readQueueItem(item);
        if (item.status === 'Đã nhận diện') syncExtractedForm();
      }
    } catch (e) {
      item.status = 'Cần xác minh';
      if (item.recognition?.status !== 'recognized') item.type = 'other';
      item.error = e.message || 'Không thể đọc tệp này.';
    }
    done++;
    const pct = Math.min(100, Math.round((done / Math.max(total, 1)) * 100));
    bar.style.width = pct + '%';
    track.setAttribute('aria-valuenow', String(pct));
    renderQueue();
    renderForm(runChecks);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  state.scanning = false;
  state.notice = '';
  bar.style.width = '100%';
  track.setAttribute('aria-valuenow', '100');
  $('progressText').textContent =
    `Đã xử lý ${done} mục · ${state.queue.filter((item) => item.status === 'Cần xác minh').length} mục cần xác minh · ${state.queue.filter((item) => item.status === 'Bỏ qua').length} mục bỏ qua.`;
  renderQueue();
  if (state.queue.some((item) => item.status === 'Đã nhận diện')) runChecks(false);
  else {
    $('resultEmpty').textContent =
      'Chưa đọc được hồ sơ để đối chiếu. Kiểm tra các tệp cần xác minh.';
    renderComparisonTable();
  }
  toast('Đã quét và cập nhật kết quả kiểm tra.');
}
