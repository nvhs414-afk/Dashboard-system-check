import { date, formatDate } from './field-values.js';

export function makeRadar(value) {
  const v = value,
    lines = [],
    checks = [],
    hasBooking = !!(v('bookingNo') || v('etd'));
  if (!hasBooking) {
    lines.push({
      title: 'Chưa có dữ liệu Booking',
      detail: 'Bổ sung Booking hoặc điền thông tin lịch tàu trước khi kiểm tra các mốc.',
      kind: 'notice',
    });
    return { actual: false, lines, checks };
  }
  lines.push({
    title: 'Booking và ETD',
    detail: `Booking ${v('bookingNo') || 'chưa đọc được'} · ETD ${formatDate(v('etd'))}`,
    kind: 'normal',
  });
  const allowances = [
    ['Free DEM', v('demFree')],
    ['Free DET', v('detFree')],
    ['Miễn gộp DET + DEM', v('freeDays')],
  ].filter(([, days]) => /^\d+$/.test(days));
  lines.push({
    title: 'DEM/DET · Free time',
    detail: allowances.length
      ? allowances.map(([label, days]) => `${label} ${days} ngày`).join(' · ') +
        '. Xác nhận điều khoản và ngày thực tế trước khi tính phí.'
      : 'Cần xác nhận số ngày miễn phí với hãng tàu hoặc đối chiếu biểu phí.',
    kind: 'notice',
  });
  const eta = date(v('etaFirst')),
    connection = date(v('etdConnect'));
  if (eta && connection) {
    const delta = Math.round((connection - eta) / 86400000),
      conflict = delta < 1;
    lines.push({
      title: conflict ? 'Lịch nối · khóa duyệt nội bộ' : 'Lịch nối · đủ thời gian đệm',
      detail: `ETA chặng 1 ${formatDate(v('etaFirst'))} · ETD tàu nối ${formatDate(v('etdConnect'))} · đệm tối thiểu 1 ngày.`,
      kind: conflict ? 'alert' : 'normal',
    });
    checks.push({
      title: 'Lịch tàu nối',
      status: conflict ? 'fail' : 'pass',
      detail: `ETA ${formatDate(v('etaFirst'))} + 1 ngày so với ETD nối ${formatDate(v('etdConnect'))}. ${conflict ? 'Xung đột, khóa duyệt Internal Booking.' : 'Đủ thời gian đệm.'}`,
    });
  } else if (v('etdConnect') || v('etaSecond'))
    lines.push({
      title: 'Lịch tàu nối',
      detail: 'Thiếu ETA chặng 1 hoặc ETD nối; chưa thể đánh giá.',
      kind: 'notice',
    });
  const reminder = (raw, days = 0, hours = 0) => {
    const d = date(raw);
    if (!d) return 'chưa xác định';
    const time = raw.match(/\b(\d{1,2}):(\d{2})\b/);
    if (time) d.setHours(+time[1], +time[2]);
    d.setTime(d.getTime() - days * 86400000 - hours * 3600000);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}${time ? ` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''}`;
  };
  const cy = v('cyCutoff'),
    icd = v('icdCutoff'),
    si = v('siCutoff');
  lines.push({
    title: 'Các mốc cut-off',
    detail: `CY ${cy || 'chưa có'} (nhắc ${reminder(cy, 2)}) · ICD ${icd || 'chưa có'} (nhắc ${reminder(icd, 2)}) · SI ${si || 'chưa có'} (nhắc ${reminder(si, 2)}). Nhắc container, seal trước 2 ngày; VGM trước CY 2 giờ (${reminder(cy, 0, 2)}). Trang không gửi thông báo tự động.`,
    kind: cy && icd ? 'normal' : 'notice',
  });
  return { actual: true, lines, checks };
}
