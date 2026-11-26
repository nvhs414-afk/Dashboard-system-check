import { $, toast } from './dom.js';
import { mountIcons } from './icons.js';
import { state, value } from './session.js';
import { renderForm, renderQueue } from './document-view.js';
import { renderCheckList, renderComparisonTable, resetDraft } from './results-view.js';
import { runChecks } from './review.js';
import { queueFiles, scan } from './upload-workflow.js';

mountIcons();

function clearAll() {
  state.queue = [];
  state.seen.clear();
  state.manual.clear();
  state.form = {};
  state.checks = [];
  state.draft = null;
  state.active = 'invoice';
  state.notice = '';
  state.showAll = false;
  $('resultContent').hidden = true;
  $('resultEmpty').hidden = false;
  $('resultEmpty').textContent = 'Chưa có kết quả kiểm tra.';
  $('progressWrap').hidden = true;
  $('files').value = '';
  resetDraft();
  renderComparisonTable();
  renderQueue();
  renderForm(runChecks);
  toast('Đã xóa dữ liệu của phiên này.');
}
const zone = $('dropZone');
zone.addEventListener('click', (e) => {
  if (e.target.closest('label')) return;
  $('files').click();
});
zone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    $('files').click();
  }
});
$('files').addEventListener('change', (e) => {
  queueFiles([...e.target.files]);
  e.target.value = '';
});
for (const ev of ['dragenter', 'dragover'])
  zone.addEventListener(ev, (e) => {
    e.preventDefault();
    zone.classList.add('dragging');
  });
for (const ev of ['dragleave', 'drop'])
  zone.addEventListener(ev, (e) => {
    e.preventDefault();
    zone.classList.remove('dragging');
  });
zone.addEventListener('drop', (e) => queueFiles([...e.dataTransfer.files]));
$('scanBtn').addEventListener('click', scan);
$('toggleChecksBtn').addEventListener('click', () => {
  state.showAll = !state.showAll;
  renderCheckList();
});
$('clearBtn').addEventListener('click', () => {
  if (!state.queue.length && !Object.values(state.form).some(Boolean)) {
    toast('Không có dữ liệu để xóa.');
    return;
  }
  $('clearDialog').showModal();
});
$('clearDialog').addEventListener('close', () => {
  if ($('clearDialog').returnValue === 'confirm') clearAll();
});
$('downloadBtn').addEventListener('click', () => {
  if (!state.draft) return;
  const blob = new Blob([JSON.stringify(state.draft, null, 2)], {
      type: 'application/json;charset=utf-8',
    }),
    a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nhap-co-${value('invoiceNo') || 'dcs'}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
});
$('printBtn').addEventListener('click', () => {
  if (state.draft) window.print();
});
resetDraft();
renderComparisonTable();
renderQueue();
renderForm(runChecks);
