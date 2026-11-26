import { groups, required, types } from './document-fields.js';
import { eq, norm } from './field-values.js';
import { makeRadar } from './booking-radar.js';

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
  const pair = (title, a, b, unit = '', numeric = false) => {
    let x = value(a),
      y = value(b);
    if (!x && !y) return;
    let detail = `Nguồn 1: ${x || 'chưa đọc được'}${unit ? ' ' + unit : ''} · Nguồn 2: ${y || 'chưa đọc được'}${unit ? ' ' + unit : ''}.`;
    add(
      title,
      !x || !y ? 'warn' : eq(x, y, numeric) ? 'pass' : 'fail',
      detail + (!x || !y ? ' Cần xác minh giá trị còn thiếu.' : ''),
    );
  };
  if (has('invoice') && has('packing')) {
    pair('CI ↔ PL · Số Invoice', 'invoiceNo', 'plInvoiceNo');
    pair('CI ↔ PL · Người xuất khẩu', 'exporter', 'plExporter');
    pair('CI ↔ PL · Người nhập khẩu', 'importer', 'plImporter');
    let iq = value('invoiceQty'),
      pq = value('plQty'),
      iu = value('invoiceUnit'),
      pu = value('plUnit');
    if (iq && pq && iu && pu && norm(iu) !== norm(pu))
      add(
        'CI ↔ PL · Số lượng và đơn vị',
        'expected',
        `CI: ${iq} ${iu} · PL: ${pq} ${pu}. Chênh lệch dự kiến (Expected Difference): khác đơn vị đo; cần xác nhận quy đổi.`,
      );
    else pair('CI ↔ PL · Số lượng', 'invoiceQty', 'plQty', iu || pu, true);
    if (iu && pu && norm(iu) === norm(pu)) pair('CI ↔ PL · Đơn vị', 'invoiceUnit', 'plUnit');
    pair('CI ↔ PL · Net Weight', 'invoiceNet', 'plNet', 'kg', true);
    pair('CI ↔ PL · Gross Weight', 'invoiceGross', 'plGross', 'kg', true);
  }
  if (has('invoice') && has('customs')) {
    pair('CI ↔ Tờ khai · Số Invoice', 'invoiceNo', 'decInvoiceNo');
    pair('CI ↔ Tờ khai · Người xuất khẩu', 'exporter', 'decExporter');
    pair('CI ↔ Tờ khai · Người nhập khẩu', 'importer', 'decImporter');
    pair('CI ↔ Tờ khai · Mã HS', 'hs', 'decHs');
    if (
      value('invoiceUnit') &&
      value('decUnit') &&
      norm(value('invoiceUnit')) !== norm(value('decUnit'))
    )
      add(
        'CI ↔ Tờ khai · Số lượng',
        'expected',
        `CI: ${value('invoiceQty')} ${value('invoiceUnit')} · Tờ khai: ${value('decQty')} ${value('decUnit')}. Cần xác nhận quy đổi.`,
      );
    else pair('CI ↔ Tờ khai · Số lượng', 'invoiceQty', 'decQty', value('invoiceUnit'), true);
    if (
      !value('invoiceUnit') ||
      !value('decUnit') ||
      norm(value('invoiceUnit')) === norm(value('decUnit'))
    )
      pair('CI ↔ Tờ khai · Đơn vị', 'invoiceUnit', 'decUnit');
    pair('CI ↔ Tờ khai · Trị giá', 'invoiceValue', 'decValue', 'USD', true);
    pair('CI ↔ Tờ khai · Gross Weight', 'invoiceGross', 'decGross', 'kg', true);
    pair('CI ↔ Tờ khai · Net Weight', 'invoiceNet', 'decNet', 'kg', true);
  }
  if (has('booking') && has('bl')) {
    pair('Booking ↔ B/L · POL', 'bookingPol', 'blPol');
    pair('Booking ↔ B/L · POD', 'bookingPod', 'blPod');
    pair('Booking ↔ B/L · Container', 'bookingContainer', 'blContainer');
    pair('Booking ↔ B/L · Seal', 'bookingSeal', 'blSeal');
  }
  if (has('booking') && has('packing'))
    pair('Booking ↔ PL · Container', 'bookingContainer', 'plContainer');
  if (has('booking') && has('customs'))
    pair('Booking ↔ Tờ khai · Container', 'bookingContainer', 'decContainer');
  if (has('customs') && has('bl'))
    pair('Tờ khai ↔ B/L · Container', 'decContainer', 'blContainer');
  if (has('packing') && has('bl'))
    pair('PL ↔ B/L · Gross Weight', 'plGross', 'blGross', 'kg', true);
  if (has('invoice') && has('co')) {
    pair('CI ↔ C/O · Số Invoice', 'invoiceNo', 'coInvoiceNo');
    pair('CI ↔ C/O · Người xuất khẩu', 'exporter', 'coExporter');
    pair('CI ↔ C/O · Người nhập khẩu', 'importer', 'coImporter');
    pair('CI ↔ C/O · Mã HS', 'hs', 'coHs');
  }
  let planned = value('plannedWeight'),
    final = value('finalWeight') || value('plGross');
  if (has('booking') && planned && final)
    add(
      'Planned Weight ↔ Final Weight',
      eq(planned, final, true) ? 'pass' : 'expected',
      `Kế hoạch: ${planned} kg · Thực tế: ${final} kg. ${eq(planned, final, true) ? 'Phù hợp.' : 'Chênh lệch kế hoạch – thực tế cần xác minh; không tự kết luận sai.'}`,
    );
  let seals = [
    ['PL', value('plSeal')],
    ['Tờ khai', value('decSeal')],
    ['Booking', value('bookingSeal')],
    ['B/L', value('blSeal')],
  ].filter(([, v]) => v);
  if (seals.some(([, v]) => norm(v) === 'na' || norm(v) === 'n a'))
    add(
      'Seal ghi NA',
      'warn',
      seals.map(([s, v]) => s + ': ' + v).join(' · ') +
        '. Cần đối chiếu với seal thực tế trước khi xác nhận.',
    );
  let channel = norm(value('decChannel'));
  if (channel === 'do' || channel === 'red')
    add(
      'Phân luồng · Đỏ',
      'fail',
      'Tờ khai: Đỏ. Chuẩn bị hồ sơ và phối hợp kiểm tra thực tế hàng hóa theo yêu cầu Hải quan.',
    );
  else if (channel === 'vang' || channel === 'yellow')
    add(
      'Phân luồng · Vàng',
      'warn',
      'Tờ khai: Vàng. Chuẩn bị và nộp hồ sơ được yêu cầu; rà soát chứng từ liên quan.',
    );
  else if (channel === 'xanh' || channel === 'green')
    add(
      'Phân luồng · Xanh',
      'pass',
      'Tờ khai: Xanh. Theo dõi thông quan và giao nhận theo quy định.',
    );
  else if (has('customs'))
    add(
      'Phân luồng chưa rõ',
      'warn',
      'Chưa đọc được kết quả phân luồng. Cần xác minh trên tờ khai.',
    );
  const radar = makeRadar(value);
  for (let c of radar.checks) add(c.title, c.status, c.detail);
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
    extra =
      channel === 'do' || channel === 'red'
        ? 18
        : channel === 'vang' || channel === 'yellow'
          ? 9
          : 0,
    score = Math.min(100, critical * 14 + warnings * 6 + extra),
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
    soToKhai: value('decNo'),
    booking: value('bookingNo'),
    tieuChiXuatXu: value('coOrigin') || 'Chưa xác định',
    diemRuiRo: score,
    mucRuiRo: level,
    kiemTra: checks,
  };
  return { checks, draft, score, level, radar };
}
