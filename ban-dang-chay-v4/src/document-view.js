import { $, esc } from './dom.js';
import { fields, groups, required, types } from './document-fields.js';
import { packingGrossForInvoice, packingUnitForInvoice, state, value } from './session.js';

export function renderStats() {
  $('statDocs').textContent = new Set(
    state.queue
      .filter((f) => f.status === 'Đã nhận diện' && groups.includes(f.type))
      .map((f) => f.type),
  ).size;
  $('statChecks').textContent = state.checks.length;
  $('statIssues').textContent = state.checks.filter((c) =>
    ['warn', 'fail'].includes(c.status),
  ).length;
  $('statRisk').textContent = state.draft?.mucRuiRo || '—';
}
export function renderQueue() {
  const entries = state.queue,
    visible = groups
      .map((t) => ({ type: t, files: entries.filter((f) => f.type === t) }))
      .filter((g) => g.files.length);
  $('docsBody').innerHTML = visible.length
    ? visible
        .map((g) => {
          const good = g.files.filter((f) => f.status === 'Đã nhận diện'),
            allFields = Object.assign({}, ...good.map((f) => f.fields)),
            count = Object.values(allFields).filter(Boolean).length;
          const status = good.length
            ? 'Đã nhận diện'
            : g.files.some((f) => f.status === 'Đang xử lý')
              ? 'Đang xử lý'
              : g.files.some((f) => f.status === 'Chờ quét')
                ? 'Chờ quét'
                : 'Cần xác minh';
          const preview = Object.entries(allFields)
            .filter(([, v]) => v)
            .slice(0, 3)
            .map(([k, v]) => `${fields[g.type]?.find((x) => x[0] === k)?.[1] || k}: ${v}`)
            .join(' · ');
          const names = [...new Set(g.files.map((f) => f.name))];
          const fileCell =
            names.length === 1
              ? esc(names[0])
              : `<details><summary>${names.length} nguồn cùng loại</summary>${names.map((n) => `<div>${esc(n)}</div>`).join('')}</details>`;
          const errors = g.files.filter((f) => f.error || f.ocrNote);
          const reason = errors.length ? errors[0].error || errors[0].ocrNote : '';
          return `<tr><td class="doc-type"><strong>${esc(types[g.type])}</strong><small>${required.includes(g.type) ? 'Bắt buộc' : 'Bổ sung'}</small></td><td><span class="mini-status ${status === 'Cần xác minh' ? 'warning' : status !== 'Đã nhận diện' ? 'pending' : ''}">${status}</span>${reason ? `<small class="error-note">${esc(reason)}</small>` : ''}</td><td class="source-list">${fileCell}</td><td>${count}</td><td>${esc(preview || 'Chưa có trường')}</td></tr>`;
        })
        .join('')
    : '<tr><td colspan="5" class="table-empty">Chưa có chứng từ chính được nhận diện. Tải CI, PL, Booking hoặc B/L rồi bấm Quét hồ sơ.</td></tr>';
  const have = new Set(
    entries
      .filter((f) => f.status === 'Đã nhận diện' && groups.includes(f.type))
      .map((f) => f.type),
  );
  const missing = required.filter((t) => !have.has(t));
  $('missingBox').classList.toggle('ok', !missing.length);
  $('missingBox').textContent = !entries.length
    ? 'Chưa có hồ sơ nguồn. Bộ lõi gồm Invoice, Packing List và Booking.'
    : missing.length
      ? 'Hồ sơ lõi chưa nhận diện: ' +
        missing.map((t) => types[t]).join(', ') +
        '. Hãy bổ sung hoặc xác minh tệp lỗi.'
      : 'Đã nhận diện đủ hồ sơ bắt buộc. Nhân viên vẫn cần kiểm tra nội dung.';
  $('scanBtn').disabled =
    state.scanning || !entries.some((f) => !['Đã nhận diện', 'Bỏ qua'].includes(f.status));
  const ignored = entries.filter((f) => f.status === 'Bỏ qua').length;
  $('uploadSummary').textContent =
    state.notice ||
    (!entries.length
      ? 'Chưa có tệp. Hãy chọn hoặc kéo thả hồ sơ.'
      : `${state.seen.size} tệp đã tải · ${have.size} nhóm chứng từ chính${ignored ? ` · ${ignored} mục ngoài phạm vi` : ''}`);
  renderStats();
}
export function renderForm(onEdit) {
  const tabs = $('formTabs');
  tabs.innerHTML = groups
    .map(
      (t) =>
        `<button type="button" role="tab" data-type="${t}" aria-selected="${state.active === t}" aria-controls="formPanel">${esc(types[t])}</button>`,
    )
    .join('');
  tabs.querySelectorAll('button').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.active = btn.dataset.type;
      renderForm(onEdit);
    }),
  );
  const booking = state.active === 'booking';
  const secondLeg = { etaFirst: 'etaSecond', etd: 'etdConnect' };
  const controls = fields[state.active].map(([key, label]) => {
    const content = esc(value(key));
    if (
      !content &&
      (key === 'etaSecond' || key === 'etdConnect' || (secondLeg[key] && value(secondLeg[key])))
    ) {
      return '<div class="field" aria-hidden="true"></div>';
    }
    return `<div class="field"><label for="field-${key}">${esc(label)}</label><input id="field-${key}" data-field="${key}" value="${content}" title="${content}" autocomplete="off" placeholder="Chưa đọc được"></div>`;
  });
  $('formPanel').innerHTML =
    `<div class="field-grid${booking ? ' booking-field-grid' : ''}">${controls.join('')}</div>`;
  $('formPanel')
    .querySelectorAll('[data-field]')
    .forEach((input) =>
      input.addEventListener('input', () => {
        state.form[input.dataset.field] = input.value;
        state.manual.add(input.dataset.field);
        input.title = input.value;
        if (state.active === 'invoice') renderSupplementalInvoiceFields();
        if (state.queue.some((f) => f.status === 'Đã nhận diện')) onEdit();
        $('dataOrigin').textContent = 'Đã chỉnh tay · kết quả đã cập nhật';
      }),
    );
  const sources = state.queue.filter((f) => f.type === state.active && f.status === 'Đã nhận diện');
  $('dataOrigin').textContent = sources.length
    ? `${fields[state.active].filter(([k]) => value(k)).length} trường từ ${sources.length} nguồn`
    : 'Chưa trích được trường nhóm này';
  if (state.active === 'invoice') renderSupplementalInvoiceFields();
}

function renderSupplementalInvoiceFields() {
  const packingValues = [
    ['invoiceGross', 'Gross Weight (kg)', packingGrossForInvoice()],
    ['invoiceUnit', 'Đơn vị', packingUnitForInvoice()],
  ];
  for (const [field, caption, packingValue] of packingValues) {
    const input = $('field-' + field);
    input.value = state.manual.has(field) ? state.form[field] : packingValue || value(field);
    input.title = input.value;
    const label = $('formPanel').querySelector(`label[for="field-${field}"]`);
    label.textContent = packingValue ? caption + ' · Packing List' : caption;
  }
}
