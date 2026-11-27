import { $, toast } from './dom.js';
import { packingGrossForInvoice, packingUnitForInvoice, state, value } from './session.js';
import { renderStats } from './document-view.js';
import { renderResults, resetResults, renderDraft, renderComparisonTable } from './results-view.js';
import { evaluateShipment } from './checks.js';

export function invalidateResult() {
  if (!state.draft) return;
  state.checks = [];
  state.draft = null;
  state.showAll = false;
  $('resultContent').hidden = true;
  $('resultEmpty').hidden = false;
  $('resultEmpty').textContent = 'Dữ liệu đã thay đổi. Hãy chạy đối chiếu lại.';
  resetResults();
  renderDraft();
  renderComparisonTable();
  renderStats();
}
export function runChecks(announce = false) {
  if (
    !state.queue.some((f) => f.status === 'Đã nhận diện') &&
    !Object.values(state.form).some(Boolean)
  ) {
    toast('Hãy tải và quét hồ sơ trước khi đối chiếu.');
    $('resultEmpty').textContent = 'Chưa có dữ liệu để đối chiếu. Hãy tải và quét hồ sơ trước.';
    return;
  }
  const { checks, draft, score, level, radar } = evaluateShipment(state.queue, value, {
    packingGross: packingGrossForInvoice(),
    packingUnit: packingUnitForInvoice(),
  });
  state.checks = checks;
  state.draft = draft;
  state.showAll = false;
  renderResults(score, level, radar);
  renderDraft();
  renderComparisonTable();
  renderStats();
  if (announce) {
    $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('Đã cập nhật kết quả kiểm tra.');
  }
}
