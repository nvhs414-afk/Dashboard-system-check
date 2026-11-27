import { $, esc } from './dom.js';
import { state } from './session.js';

export function resetResults() {
  $('scoreValue').textContent = '—';
  $('riskBadge').textContent = 'Chưa chạy';
  $('riskBadge').className = 'badge neutral';
  $('riskExplanation').textContent = 'Tải và quét hồ sơ để bắt đầu.';
  $('scoreFill').style.width = '0';
}
export function renderComparisonTable() {
  $('checksTableBody').innerHTML = state.checks.length
    ? state.checks
        .map(
          (c) =>
            `<tr><td><strong>${esc(c.title)}</strong></td><td><span class="badge ${c.status === 'pass' ? 'good' : c.status === 'fail' ? 'bad' : 'amber'}">${c.status === 'pass' ? 'Đạt' : c.status === 'expected' ? 'Chênh lệch dự kiến' : 'Cần xử lý'}</span></td><td>${esc(c.detail)}</td></tr>`,
        )
        .join('')
    : '<tr><td colspan="3" class="table-empty">Chưa có kết quả. Tải hồ sơ và bấm Quét hồ sơ để tự đọc và đối chiếu.</td></tr>';
}
export function renderCheckList() {
  const sorted = [...state.checks].sort(
    (a, b) =>
      ({ fail: 0, warn: 1, expected: 2, pass: 3 })[a.status] -
      { fail: 0, warn: 1, expected: 2, pass: 3 }[b.status],
  );
  const attention = sorted.filter((c) => c.status !== 'pass');
  const visible = state.showAll
    ? sorted
    : attention.length
      ? attention.slice(0, 5)
      : sorted.slice(0, 3);
  $('checksList').innerHTML = visible
    .map(
      (c) =>
        `<article class="check ${c.status === 'fail' ? 'fail' : c.status === 'warn' || c.status === 'expected' ? 'warn' : ''}"><div class="check-top"><strong>${esc(c.title)}</strong><span class="badge ${c.status === 'pass' ? 'good' : c.status === 'fail' ? 'bad' : 'amber'}">${c.status === 'pass' ? 'Đạt' : c.status === 'expected' ? 'Chênh lệch dự kiến' : 'Cần xử lý'}</span></div><p>${esc(c.detail)}</p></article>`,
    )
    .join('');
  $('toggleChecksBtn').hidden = sorted.length <= visible.length;
  $('toggleChecksBtn').textContent = state.showAll
    ? 'Thu gọn kiểm tra'
    : `Xem đủ ${sorted.length} kiểm tra`;
}
export function renderResults(score, level, radar) {
  $('resultEmpty').hidden = true;
  $('resultContent').hidden = false;
  $('scoreValue').textContent = score;
  $('riskBadge').textContent = 'Rủi ro ' + level;
  $('riskBadge').className =
    'badge ' + (level === 'Cao' ? 'bad' : level === 'Trung bình' ? 'amber' : 'good');
  $('riskExplanation').textContent = 'Ưu tiên kiểm tra các điểm cần xử lý bên dưới.';
  $('scoreFill').style.width = score + '%';
  $('scoreFill').style.background =
    level === 'Cao' ? '#c43d4f' : level === 'Trung bình' ? '#dd9c28' : '#0e9f83';
  const issues = state.checks.filter((c) => c.status === 'fail' || c.status === 'warn').length,
    expected = state.checks.filter((c) => c.status === 'expected').length;
  $('checkSummary').textContent =
    `${issues} điểm cần xem lại · ${expected} chênh lệch dự kiến · ${state.checks.filter((c) => c.status === 'pass').length} kiểm tra đạt.`;
  renderCheckList();
  $('radarOrigin').textContent = radar.actual ? 'Từ hồ sơ đã tải' : 'Chưa đủ dữ liệu';
  $('radarContent').innerHTML = radar.lines
    .map(
      (x) =>
        `<div class="radar-line ${x.kind}"><strong>${esc(x.title)}</strong><p>${esc(x.detail)}</p></div>`,
    )
    .join('');
}

export function renderDraft() {
  const d = state.draft,
    items = [
      ['Số Invoice', d?.hoaDon],
      ['Người xuất khẩu', d?.nguoiXuatKhau],
      ['Người nhập khẩu', d?.nguoiNhapKhau],
      ['Tên hàng', d?.tenHang],
      ['Mã HS', d?.maHS],
      ['Số lượng', d?.soLuong],
      ['Gross Weight', d?.grossWeightKg ? d.grossWeightKg + ' kg' : ''],
      ['Tiêu chí xuất xứ', d?.tieuChiXuatXu],
    ];
  const missing = d ? 'Chưa xác định' : '—';
  $('draftFields').innerHTML = items
    .map(
      ([k, v]) =>
        `<div class="draft-field"><span>${esc(k)}</span><b>${esc(v || missing)}</b></div>`,
    )
    .join('');
  $('downloadBtn').disabled = !d;
  $('printBtn').disabled = !d;
}
