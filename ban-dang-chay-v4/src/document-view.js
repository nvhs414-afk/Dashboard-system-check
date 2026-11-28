import { $, esc } from './dom.js';
import { bookingDeadlineWarnings, bookingWarningLabels } from './booking-deadlines.js';
import { fields, groups, required, types } from './document-fields.js';
import { freeTimeFields, standardDetTerm } from './booking-free-time.js';
import { formatUsd, norm } from './field-values.js';
import { selectBookingSources } from './booking-revisions.js';
import {
  billIdentifiersForPacking,
  billPartiesForBooking,
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
    visible = [...groups, 'other']
      .map((t) => ({
        type: t,
        files: entries.filter(
          (f) => f.type === t && (t !== 'other' || f.status === 'Cần xác minh'),
        ),
      }))
      .filter((g) => g.files.length);
  $('docsBody').innerHTML = visible.length
    ? visible
        .map((g) => {
          const good = g.files.filter((f) => f.status === 'Đã nhận diện'),
            allFields = Object.assign({}, ...good.map((f) => f.fields)),
            displayedFields = (fields[g.type] || []).filter(([key]) => allFields[key]);
          const status = good.length
            ? 'Đã nhận diện'
            : g.files.some((f) => f.status === 'Đang xử lý')
              ? 'Đang xử lý'
              : g.files.some((f) => f.status === 'Chờ quét')
                ? 'Chờ quét'
                : 'Cần xác minh';
          const preview = displayedFields
            .slice(0, 3)
            .map(([key, caption]) => `${caption}: ${allFields[key]}`)
            .join(' · ');
          const names = [...new Set(g.files.map((f) => f.name))];
          const fileCell =
            names.length === 1
              ? esc(names[0])
              : `<details><summary>${names.length} nguồn cùng loại</summary>${names.map((n) => `<div>${esc(n)}</div>`).join('')}</details>`;
          const errors = g.files.filter((f) => f.error || f.ocrNote);
          const reason = errors.length ? errors[0].error || errors[0].ocrNote : '';
          return `<tr><td class="doc-type"><strong>${esc(types[g.type] || 'Chưa xác định loại')}</strong>${g.type === 'other' ? '' : `<small>${required.includes(g.type) ? 'Bắt buộc' : 'Bổ sung'}</small>`}</td><td><span class="mini-status ${status === 'Cần xác minh' ? 'warning' : status !== 'Đã nhận diện' ? 'pending' : ''}">${status}</span>${reason ? `<small class="error-note">${esc(reason)}</small>` : ''}</td><td class="source-list">${fileCell}</td><td>${displayedFields.length}</td><td>${esc(preview || 'Chưa có trường')}</td></tr>`;
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
  if (booking) controls.push(renderBookingRevisionNotice(), renderBookingFreeTimeEvidence());
  if (state.active === 'packing')
    controls.push('<p id="packing-identifier-note" class="field-wide error-note" hidden></p>');
  controls.push(
    '<details id="field-sources" class="field-wide field-sources" hidden><summary>Nguồn các trường đã đọc</summary><ul></ul></details>',
  );
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
        renderFieldSources();
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
  const sources = state.queue.filter((f) => f.type === state.active && f.status === 'Đã nhận diện');
  $('dataOrigin').textContent = sources.length
    ? `${fields[state.active].filter(([k]) => value(k)).length} trường từ ${sources.length} nguồn`
    : 'Chưa trích được trường nhóm này';
  renderSupplementalFields();
  renderFieldSources();
  refreshBookingWarnings();
}

function renderBookingRevisionNotice() {
  const { mixed, conflicts, older, changed } = selectBookingSources(state.queue);
  const labels = (keys) =>
    fields.booking
      .filter(([key]) => keys.includes(key))
      .map(([, label]) => label)
      .join(', ');
  const messages = [];
  if (mixed) messages.push('Có nhiều nguồn Booking chưa đối chiếu được với cùng một số Booking.');
  if (older)
    messages.push(
      `Đang dùng Booking có ngày phát hành mới nhất${labels(changed) ? ' · Đã đổi: ' + labels(changed) : ''}.`,
    );
  if (labels(conflicts))
    messages.push('Cần xác minh các trường khác nhau giữa các bản: ' + labels(conflicts) + '.');
  return messages.length ? `<p class="field-wide error-note">${esc(messages.join(' '))}</p>` : '';
}

function renderFieldSources() {
  const panel = $('field-sources');
  const sources =
    state.active === 'booking'
      ? selectBookingSources(state.queue).sources
      : state.queue.filter((item) => item.type === state.active && item.status === 'Đã nhận diện');
  const packing = state.active === 'packing' ? billIdentifiersForPacking() : {};
  const items = fields[state.active].flatMap(([key, caption]) => {
    if (state.manual.has(key) || !(packing[key]?.value || value(key))) return [];
    const source = packing[key]?.item ?? sources.find((item) => item.fields[key] === value(key));
    if (!source) return [];
    const readValue = packing[key]?.value || value(key);
    const needle = norm(readValue);
    let page = source.pdf?.pages.length === 1 ? source.pdf.pages[0].number : '';
    let currentPage = page;
    let quote = '';
    for (const line of (source.raw || '').split('\n')) {
      const marker = line.match(/^\[Trang (\d+)\]$/);
      if (marker) currentPage = marker[1];
      else if (needle.length >= 4 && (' ' + norm(line) + ' ').includes(' ' + needle + ' ')) {
        page = currentPage;
        quote = line.trim().slice(0, 240);
        break;
      }
    }
    const location = page ? (source.sourceName || source.name) + ' · Trang ' + page : source.name;
    return `<li><strong>${esc(caption)}</strong><small>${esc(location)}</small>${quote ? `<div>${esc(quote)}</div>` : ''}</li>`;
  });
  panel.hidden = !items.length;
  panel.querySelector('ul').innerHTML = items.join('');
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
    <details><summary>Mốc thực tế dùng để đối chiếu</summary><div class="booking-warning-grid">${controls.join('')}</div></details>
  </section>`;
}

export function refreshBookingWarnings() {
  const panel = $('bookingWarnings');
  if (!panel) return;
  const evidence = bookingFreeTimeEvidence();
  const applicable = evidence.filter((entry) => entry.applicable);
  const standard = !state.manual.has('detFree') && standardDetTerm(evidence);
  $('formPanel').querySelector('[for="field-detFree"]').textContent =
    freeTimeFields.detFree + (standard ? ' · Tiêu chuẩn' : '');
  for (const key of Object.keys(freeTimeFields)) {
    const input = $('field-' + key);
    let hint = 'Cần xác nhận';
    if (key !== 'freeDays' && value('freeDays')) hint = 'Áp dụng hạn gộp';
    else if (key === 'freeDays' && value('demFree') && value('detFree'))
      hint = 'DEM và DET ghi riêng';
    else if (applicable.some((entry) => entry.field === 'tariff') && key !== 'detFree')
      hint = 'Cần tra biểu phí';
    else if (
      applicable.length &&
      !applicable.some((entry) => entry.field === key || entry.field === 'unclear')
    )
      hint = 'Booking chưa ghi số ngày';
    input.placeholder = hint;
  }
  const warnings = bookingDeadlineWarnings(
    value,
    state.manual.has('detFree')
      ? evidence.filter(({ field }) => field !== 'standardDet')
      : evidence,
  );
  const markup = Object.entries(bookingWarningLabels)
    .map(([key, label]) => {
      const { status, message, detail, deadline, reminder } = warnings[key];
      return `<article class="booking-warning" data-warning="${key}" data-status="${status}"><h4>${label}</h4><strong>${esc(message)}</strong>${deadline ? `<p>Hạn dự kiến <b>${esc(deadline)}</b><br>Mốc nhắc trước 24 giờ <b>${esc(reminder)}</b></p>` : ''}<p>${esc(detail)}</p></article>`;
    })
    .join('');
  if (panel.innerHTML !== markup) panel.innerHTML = markup;
}

function renderBookingFreeTimeEvidence() {
  const evidence = bookingFreeTimeEvidence();
  if (!evidence.length) return '';
  const clauses = new Map();
  for (const { file, page, quote, commodity, service, applicable } of evidence) {
    const location = file + (page ? ' · Trang ' + page : '');
    clauses.set(location + '\n' + quote, { location, quote, commodity, service, applicable });
  }
  const items = [...clauses.values()].map(
    ({ location, quote, commodity, service, applicable }) =>
      `<li><small>${esc(location)}${service ? ' · Service ' + esc(service) : ''}${commodity ? ' · Hàng: ' + esc(commodity) : ''}${applicable ? '' : ' · Cần đối chiếu điều kiện áp dụng'}</small><div>${esc(quote)}</div></li>`,
  );
  const tariff = evidence.some(({ field, applicable }) => field === 'tariff' && applicable)
    ? '<p>Booking dẫn chiếu biểu phí hãng tàu. Cần tra biểu phí để xác nhận số ngày.</p>'
    : '';
  const standard = standardDetTerm(evidence);
  const standardNote = standard ? ` · DET tiêu chuẩn ${esc(standard.value)} ngày` : '';
  const contract = standard
    ? '<p>Nếu có thỏa thuận riêng cho lô hàng, áp dụng số ngày theo thỏa thuận đó.</p>'
    : '';
  return `<details class="field-wide free-time-evidence"><summary>Nguồn Free DEM / DET${standardNote}</summary>${contract}${tariff}<ul>${items.join('')}</ul></details>`;
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
    const { plContainer, plSeal, reason } = billIdentifiersForPacking();
    entries = [
      ['plContainer', 'Container', plContainer?.value, plContainer?.item],
      ['plSeal', 'Seal', plSeal?.value, plSeal?.item],
    ];
    for (const [field] of entries) {
      $('field-' + field).placeholder = reason ? 'Cần xác minh' : 'Chưa đọc được';
    }
    const note = $('packing-identifier-note');
    note.textContent = reason && entries.some(([field]) => !value(field)) ? reason : '';
    note.hidden = !note.textContent;
  } else if (state.active === 'booking') {
    const { bookingShipper, bookingConsignee } = billPartiesForBooking();
    entries = [
      ['bookingShipper', 'Shipper', bookingShipper],
      ['bookingConsignee', 'Consignee', bookingConsignee],
    ];
    source = 'B/L';
  } else return;

  for (const [field, caption, supplementalValue, item] of entries) {
    const input = $('field-' + field);
    input.value = state.manual.has(field) ? state.form[field] : supplementalValue || value(field);
    input.title = item ? input.value + ' · ' + item.name : input.value;
    const label = $('formPanel').querySelector(`label[for="field-${field}"]`);
    label.textContent = supplementalValue
      ? caption + ' · ' + (item?.type === 'booking' ? 'Booking' : item ? 'B/L' : source)
      : caption;
  }
}
