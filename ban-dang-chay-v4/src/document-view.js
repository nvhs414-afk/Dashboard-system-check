import { $, esc } from './dom.js';
import { bookingDeadlineWarnings, bookingWarningLabels } from './booking-deadlines.js';
import { fields, groups, required, types } from './document-fields.js';
import { freeTimeFields } from './booking-free-time.js';
import { formatUsd } from './field-values.js';
import {
  billIdentifiersForPacking,
  bookingFreeTimeEvidence,
  packingGrossForInvoice,
  packingUnitForInvoice,
  state,
  value,
} from './session.js';

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
  const controls = fields[state.active].flatMap(([key, label]) => {
    const raw = value(key);
    const content = esc(key === 'invoiceValue' ? formatUsd(raw) : raw);
    if (key === 'plItems') {
      return `<div class="field field-wide"><label for="field-${key}">${esc(label)}</label><small id="packing-item-format">Item - Description of goods - Size - Quantity (PCS/SET)</small><textarea id="field-${key}" data-field="${key}" rows="5" aria-describedby="packing-item-format" placeholder="Chưa đọc được">${content}</textarea></div>`;
    }
    if (
      !content &&
      (key === 'etaSecond' || key === 'etdConnect' || (secondLeg[key] && value(secondLeg[key])))
    ) {
      return '<div class="field" aria-hidden="true"></div>';
    }
    const freeTime = Object.hasOwn(freeTimeFields, key);
    const placeholder = freeTime ? 'Cần xác nhận' : 'Chưa đọc được';
    const input = `<div class="field"><label for="field-${key}">${esc(label)}</label><input id="field-${key}" data-field="${key}" value="${content}" title="${content}" autocomplete="off" placeholder="${placeholder}"${freeTime ? ' inputmode="numeric"' : ''}></div>`;
    return key === 'freeDays' ? [input, renderBookingWarningsPanel()] : input;
  });
  if (booking) controls.push(renderBookingFreeTimeEvidence());
  $('formPanel').innerHTML =
    `<div class="field-grid${booking ? ' booking-field-grid' : ''}">${controls.join('')}</div>`;
  $('formPanel')
    .querySelectorAll('[data-field]')
    .forEach((input) =>
      input.addEventListener('input', () => {
        state.form[input.dataset.field] = input.value;
        state.manual.add(input.dataset.field);
        input.title = input.value;
        renderSupplementalFields();
        refreshBookingWarnings();
        if (state.queue.some((f) => f.status === 'Đã nhận diện')) onEdit();
        $('dataOrigin').textContent = 'Đã chỉnh tay · kết quả đã cập nhật';
      }),
    );
  $('field-invoiceValue')?.addEventListener('blur', (event) => {
    const input = event.currentTarget;
    input.value = formatUsd(input.value.trim());
    input.title = input.value;
  });
  if (booking) {
    $('bookingEmail').addEventListener('input', (event) => {
      state.bookingEmail = event.currentTarget.value.trim();
      refreshBookingWarnings();
    });
    $('bookingEmailDraft').addEventListener('click', openBookingEmailDraft);
  }
  const sources = state.queue.filter((f) => f.type === state.active && f.status === 'Đã nhận diện');
  $('dataOrigin').textContent = sources.length
    ? `${fields[state.active].filter(([k]) => value(k)).length} trường từ ${sources.length} nguồn`
    : 'Chưa trích được trường nhóm này';
  renderSupplementalFields();
  refreshBookingWarnings();
}

function renderBookingWarningsPanel() {
  const eventFields = [
    ['bookingPickupActual', 'Lấy container rỗng thực tế'],
    ['bookingGateInActual', 'Hạ bãi thực tế (gate-in)'],
    ['bookingAtd', 'Khởi hành thực tế (ATD)'],
  ];
  const controls = eventFields.map(([key, label]) => {
    const content = esc(value(key));
    return `<div class="field"><label for="field-${key}">${esc(label)}</label><input id="field-${key}" data-field="${key}" value="${content}" title="${content}" autocomplete="off" placeholder="DD/MM/YYYY HH:mm"></div>`;
  });
  return `<section class="field-wide booking-warnings" aria-label="Cảnh báo DEM và DET">
    <div id="bookingWarnings" class="booking-warning-grid" aria-live="polite"></div>
    <p class="booking-warning-note">Ước tính cho hàng xuất theo ngày lịch, tính ngày bắt đầu là ngày 1, theo giờ Việt Nam. Cảnh báo cập nhật khi mở trang.</p>
    <div class="booking-email">
      <div class="booking-email-controls">
        <div class="field"><label for="bookingEmail">Email nhận cảnh báo</label><input id="bookingEmail" type="email" required autocomplete="email" aria-describedby="bookingEmailPreview" placeholder="ten@gmail.com" value="${esc(state.bookingEmail)}"></div>
        <button id="bookingEmailDraft" type="button" class="button primary" disabled>Soạn trong Gmail</button>
      </div>
      <p id="bookingEmailPreview" class="booking-warning-note" role="status"></p>
    </div>
    <details><summary>Mốc thực tế dùng để đối chiếu</summary><div class="booking-warning-grid">${controls.join('')}</div></details>
  </section>`;
}

export function refreshBookingWarnings() {
  const panel = $('bookingWarnings');
  if (!panel) return;
  const warnings = bookingDeadlineWarnings(value, bookingFreeTimeEvidence());
  const markup = Object.entries(bookingWarningLabels)
    .map(([key, label]) => {
      const { status, message, detail, deadline, reminder } = warnings[key];
      return `<article class="booking-warning" data-warning="${key}" data-status="${status}"><h4>${label}</h4><strong>${esc(message)}</strong>${deadline ? `<p>Hạn dự kiến <b>${esc(deadline)}</b><br>Mốc nhắc trước 24 giờ <b>${esc(reminder)}</b></p>` : ''}<p>${esc(detail)}</p></article>`;
    })
    .join('');
  if (panel.innerHTML !== markup) panel.innerHTML = markup;
  const { emailReminders } = warnings;
  const email = $('bookingEmail');
  const preview = $('bookingEmailPreview');
  const text =
    email.value && !email.validity.valid
      ? 'Kiểm tra địa chỉ email.'
      : emailReminders.join('\n') ||
        'Có thể soạn thư trong 24 giờ trước hạn và trong ngày đến hạn DEM, DET hoặc ETD.';
  if (preview.textContent !== text) preview.textContent = text;
  $('bookingEmailDraft').disabled = !emailReminders.length || !email.validity.valid;
}

function openBookingEmailDraft() {
  const email = $('bookingEmail');
  const { emailReminders } = bookingDeadlineWarnings(value, bookingFreeTimeEvidence());
  if (!email.validity.valid || !emailReminders.length) return;
  const booking = value('bookingNo');
  const url = new URL('https://mail.google.com/mail/');
  url.search = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: email.value.trim(),
    su: `CẢNH BÁO HẠN BOOKING${booking ? ' ' + booking : ''}`,
    body: emailReminders.join('\r\n'),
  }).toString();
  window.open(url.href, '_blank', 'noopener,noreferrer');
}

function renderBookingFreeTimeEvidence() {
  const evidence = bookingFreeTimeEvidence();
  if (!evidence.length) return '';
  const clauses = new Map();
  for (const { file, page, quote, commodity, applicable } of evidence) {
    const location = file + (page ? ' · Trang ' + page : '');
    clauses.set(location + '\n' + quote, { location, quote, commodity, applicable });
  }
  const items = [...clauses.values()].map(
    ({ location, quote, commodity, applicable }) =>
      `<li><small>${esc(location)}${commodity ? ' · Hàng: ' + esc(commodity) : ''}${applicable ? '' : ' · Điều khoản theo loại hàng khác hoặc cần xác nhận'}</small><div>${esc(quote)}</div></li>`,
  );
  const tariff = evidence.some(({ field, applicable }) => field === 'tariff' && applicable)
    ? '<p>Booking dẫn chiếu biểu phí hãng tàu. Cần tra biểu phí để xác nhận số ngày.</p>'
    : '';
  return `<details class="field-wide free-time-evidence"><summary>Nguồn Free DEM / DET</summary>${tariff}<ul>${items.join('')}</ul></details>`;
}

function renderSupplementalFields() {
  let entries, source;
  if (state.active === 'invoice') {
    entries = [
      ['invoiceGross', 'Gross Weight (kg)', packingGrossForInvoice()],
      ['invoiceUnit', 'Đơn vị', packingUnitForInvoice()],
    ];
    source = 'Packing List';
  } else if (state.active === 'packing') {
    const { plContainer, plSeal } = billIdentifiersForPacking();
    entries = [
      ['plContainer', 'Container', plContainer],
      ['plSeal', 'Seal', plSeal],
    ];
    source = 'B/L';
  } else return;

  for (const [field, caption, supplementalValue] of entries) {
    const input = $('field-' + field);
    input.value = state.manual.has(field) ? state.form[field] : supplementalValue || value(field);
    input.title = input.value;
    const label = $('formPanel').querySelector(`label[for="field-${field}"]`);
    label.textContent = supplementalValue ? caption + ' · ' + source : caption;
  }
}
