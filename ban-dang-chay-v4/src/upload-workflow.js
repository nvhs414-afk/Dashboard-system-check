import { $, toast } from './dom.js';
import { groups } from './document-fields.js';
import { state } from './session.js';
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
import { sourceType, extractFields } from './extraction.js';
import { extractBillOfLadingFields } from './bill-of-lading.js';

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
  const next = {};
  for (const type of groups) {
    const sources = state.queue
      .filter((item) => item.type === type && item.status === 'Đã nhận diện')
      .sort((a, b) => Object.keys(b.fields).length - Object.keys(a.fields).length);
    for (const item of sources)
      for (const [key, val] of Object.entries(item.fields)) if (val && !next[key]) next[key] = val;
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

async function readQueueItem(item) {
  const pdfPages = [];
  let text =
    item.kind === 'sheet'
      ? item.sheetText
      : await readDocument(item.file, item.kind, { onPdfPage: (items) => pdfPages.push(items) });
  item.raw = text;
  item.type = sourceType(item.kind === 'sheet' ? item.sheetName : item.file.name, text);
  if (!text.trim()) throw Error('Không đọc được nội dung; kiểm tra chất lượng tệp hoặc nhập tay.');
  if (!groups.includes(item.type)) {
    item.status = 'Bỏ qua';
    item.fields = {};
  } else {
    let positionedFields = {};
    if (item.type === 'bl') {
      for (const page of pdfPages) {
        positionedFields = { ...extractBillOfLadingFields(page), ...positionedFields };
      }
    }
    item.fields = { ...extractFields(item.type, text, item.sheetRows), ...positionedFields };
    if (item.kind === 'pdf' && Object.keys(item.fields).length < 3) {
      try {
        $('progressText').textContent = `Đang OCR bổ sung ${item.name}`;
        const ocrText = await readDocument(item.file, 'pdf', { forceOcr: true }),
          expanded = { ...extractFields(item.type, text + '\n' + ocrText), ...positionedFields };
        if (Object.keys(expanded).length > Object.keys(item.fields).length) {
          text += '\n' + ocrText;
          item.raw = text;
          item.fields = expanded;
        }
      } catch (e) {
        item.ocrNote = `OCR bổ sung chưa hoàn tất: ${e.message || 'không đọc được ảnh'}`;
      }
    }
    if (!Object.keys(item.fields).length)
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
      }
      if (['xlsx', 'xls', 'xlsm', 'csv'].includes(item.kind)) {
        const children = await expandSpreadsheet(item);
        state.queue.splice(i, 1, ...children);
        total += children.length - 1;
        i--;
        continue;
      }
      await readQueueItem(item);
      if (item.status === 'Đã nhận diện') syncExtractedForm();
    } catch (e) {
      item.status = 'Cần xác minh';
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
    `Đã xử lý ${done} mục · ${state.queue.filter((item) => item.status === 'Cần xác minh' && groups.includes(item.type)).length} chứng từ chính cần xác minh · ${state.queue.filter((item) => item.status === 'Bỏ qua').length} mục ngoài phạm vi.`;
  renderQueue();
  if (state.queue.some((item) => item.status === 'Đã nhận diện')) runChecks(false);
  else {
    $('resultEmpty').textContent =
      'Chưa đọc được hồ sơ để đối chiếu. Kiểm tra các tệp cần xác minh.';
    renderComparisonTable();
  }
  toast('Đã quét và cập nhật kết quả kiểm tra.');
}
