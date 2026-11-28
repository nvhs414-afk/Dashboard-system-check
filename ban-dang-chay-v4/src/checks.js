import { groups, required, types } from './document-fields.js';
import { eq, norm } from './field-values.js';
import { makeRadar } from './booking-radar.js';
import { samePort } from './booking-notice.js';

export function evaluateShipment(queue, value, { packingGross = '', packingUnit = '' } = {}) {
  let checks = [];
  const add = (title, status, detail) => checks.push({ title, status, detail });
  const has = (t) => queue.some((f) => f.type === t && f.status === 'Đã nhận diện');
  for (let t of required)
    if (!has(t))
      add(
        'Thiếu hồ sơ bắt buộc: ' + types[t],
        'fail',
        'Chưa nhận diện ' + types[t] + ' trong bộ tệp đã quét. Cần bổ sung hoặc xác minh tệp lỗi.',
      );
  const compare = (title, x, y, unit = '', matches = eq, sourceNote = '') => {
    if (!x && !y) return;
    let detail = `Nguồn 1: ${x || 'chưa đọc được'}${unit ? ' ' + unit : ''} · Nguồn 2: ${y || 'chưa đọc được'}${unit ? ' ' + unit : ''}.`;
    add(
      title,
      !x || !y ? 'warn' : matches(x, y) ? 'pass' : 'fail',
      detail + sourceNote + (!x || !y ? ' Cần xác minh giá trị còn thiếu.' : ''),
    );
  };
  const equalNumbers = (a, b) => eq(a, b, true);
  const pair = (title, a, b, unit = '', numeric = false) =>
    compare(title, value(a), value(b), unit, numeric ? equalNumbers : eq);
  if (has('invoice') && has('packing')) {
    pair('CI ↔ PL · Số Invoice', 'invoiceNo', 'plInvoiceNo');
    pair('CI ↔ PL · Người xuất khẩu', 'exporter', 'plExporter');
    pair('CI ↔ PL · Người nhập khẩu', 'importer', 'plImporter');
    const iq = value('invoiceQty'),
      pq = value('plQty'),
      iu = packingUnit || value('invoiceUnit'),
      pu = value('plUnit');
    if (iq && pq && iu && pu && norm(iu) !== norm(pu))
      add(
        'CI ↔ PL · Số lượng và đơn vị',
        'expected',
        `CI: ${iq} ${iu} · PL: ${pq} ${pu}. Chênh lệch dự kiến (Expected Difference): khác đơn vị đo; cần xác nhận quy đổi.`,
      );
    else pair('CI ↔ PL · Số lượng', 'invoiceQty', 'plQty', iu || pu, true);
    if (iu && pu && norm(iu) === norm(pu)) {
      compare(
        'CI ↔ PL · Đơn vị',
        iu,
        pu,
        '',
        eq,
        packingUnit ? ' CI hiển thị đơn vị lấy từ Packing List khớp số Invoice và số lượng.' : '',
      );
    }
    compare(
      'CI ↔ PL · Gross Weight',
      value('invoiceGross') || packingGross,
      value('plGross'),
      'kg',
      equalNumbers,
      packingGross ? ' CI hiển thị số đã lấy từ Packing List.' : '',
    );
  }
  if (has('booking') && has('bl')) {
    compare('Booking ↔ B/L · POL', value('bookingPol'), value('blPol'), '', samePort);
    compare(
      'Booking ↔ B/L · POD',
      value('bookingDischarge') || value('bookingPod'),
      value('blPod'),
      '',
      samePort,
    );
  }
  if (has('packing') && has('bl'))
    pair('PL ↔ B/L · Gross Weight', 'plGross', 'blGross', 'kg', true);
  let seals = [
    ['PL', value('plSeal')],
    ['B/L', value('blSeal')],
  ].filter(([, v]) => v);
  if (seals.some(([, v]) => norm(v) === 'na' || norm(v) === 'n a'))
    add(
      'Seal ghi NA',
      'warn',
      seals.map(([s, v]) => s + ': ' + v).join(' · ') +
        '. Cần đối chiếu với seal thực tế trước khi xác nhận.',
    );
  const radar = makeRadar(value);
  checks.unshift(...radar.checks.filter((check) => check.alert));
  checks.push(...radar.checks.filter((check) => !check.alert));
  for (const type of groups) {
    const failed = queue.filter((f) => f.type === type && f.status === 'Cần xác minh');
    if (failed.length && !has(type))
      add(
        `${types[type]} cần xác minh`,
        'warn',
        `${failed.length} nguồn chưa trích được trường. ${failed[0].error || 'Cần kiểm tra tệp và điền tay.'}`,
      );
  }
  let critical = checks.filter((c) => c.status === 'fail').length,
    warnings = checks.filter((c) => c.status === 'warn').length,
    score = Math.min(100, critical * 14 + warnings * 6),
    level = score >= 50 ? 'Cao' : critical > 0 || score >= 20 ? 'Trung bình' : 'Thấp';
  const draft = {
    nhan: 'Chưa phải C/O chính thức',
    nguon: 'Dữ liệu từ hồ sơ đã đọc hoặc nhân viên nhập trong phiên',
    hoaDon: value('invoiceNo'),
    ngayHoaDon: value('invoiceDate'),
    nguoiXuatKhau: value('exporter'),
    nguoiNhapKhau: value('importer'),
    tenHang: value('description'),
    maHS: value('hs'),
    soLuong: [value('invoiceQty'), packingUnit || value('invoiceUnit')].filter(Boolean).join(' '),
    netWeightKg: value('invoiceNet'),
    grossWeightKg: value('invoiceGross') || packingGross,
    triGiaUSD: value('invoiceValue'),
    booking: value('bookingNo'),
    tieuChiXuatXu: 'Chưa xác định',
    diemRuiRo: score,
    mucRuiRo: level,
    kiemTra: checks,
  };
  return { checks, draft, score, level, radar };
}
