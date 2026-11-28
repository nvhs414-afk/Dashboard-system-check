const hour = 3_600_000;
const day = 24 * hour;
const vietnamOffset = 7 * hour;

function timestamp(value) {
  const match = value.match(
    /^(?:(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})|(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}))(?:(?:[ T]+)(\d{1,2}):(\d{2}))?$/,
  );
  if (!match) return null;
  const [, ymdYear, ymdMonth, ymdDay, dmyDay, dmyMonth, dmyYear, hours, minutes] = match;
  const year = Number(ymdYear || dmyYear);
  const month = Number(ymdMonth || dmyMonth) - 1;
  const date = Number(ymdDay || dmyDay);
  const local = new Date(Date.UTC(year, month, date, Number(hours || 0), Number(minutes || 0)));
  if (
    +hours > 23 ||
    +minutes > 59 ||
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month ||
    local.getUTCDate() !== date
  )
    return null;
  return { instant: local.getTime() - vietnamOffset, hasTime: !!hours };
}

function localDay(instant) {
  return Math.floor((instant + vietnamOffset) / day) * day - vietnamOffset;
}

function display(instant, hasTime = true) {
  const [date, time] = new Date(instant + vietnamOffset).toISOString().split('T');
  return date.split('-').reverse().join('/') + (hasTime ? ' ' + time.slice(0, 5) : '');
}

function earlier(a, b) {
  if (a.hasTime && b.hasTime) return a.instant < b.instant;
  return localDay(a.instant) < localDay(b.instant);
}

function allowance(value) {
  return /^\d{1,3}$/.test(value) ? Number(value) : null;
}

function departureTiming(etd, atd) {
  const hasTimes = etd.hasTime && atd.hasTime;
  if (!hasTimes && localDay(etd.instant) === localDay(atd.instant))
    return 'ATD và ETD cùng ngày · cần giờ thực tế để đối chiếu';
  if (atd.instant === etd.instant) return 'Khởi hành đúng ETD';

  const difference = hasTimes
    ? Math.round(Math.abs(atd.instant - etd.instant) / 60_000)
    : Math.abs(localDay(atd.instant) - localDay(etd.instant)) / day;
  const duration = hasTimes
    ? [
        Math.floor(difference / 60) ? `${Math.floor(difference / 60)} giờ` : '',
        difference % 60 ? `${difference % 60} phút` : '',
      ]
        .filter(Boolean)
        .join(' ')
    : `${difference} ngày`;
  return `Khởi hành ${earlier(atd, etd) ? 'sớm' : 'trễ'} hơn ETD ${duration}`;
}

const pending = (detail) => ({ status: 'pending', message: 'Cần xác nhận', detail });

function deadline({ name, start, days, end, closed, now, detail, workingDays }) {
  if (workingDays) return pending('Điều khoản ghi ngày làm việc. Cần lịch nghỉ của hãng tàu.');
  if (!start || days === null) return pending(detail);
  if (end && earlier(end, start)) return pending('Kiểm tra lại thứ tự các mốc thời gian.');

  // The event date is day one. The deadline is 00:00 on the first potentially chargeable day.
  const limit = localDay(start.instant) + days * day;
  const reminder = limit - day;
  const excess = end ? Math.max(0, (localDay(end.instant) - limit) / day + 1) : null;
  const timeLeft = limit - now;
  let status = 'normal';
  let message = 'Chưa tới mốc nhắc';
  if (closed && excess !== null) {
    status = excess ? 'alert' : 'normal';
    message = excess ? `Ước tính vượt ${excess} ngày ${name}` : 'Mốc thực tế trong hạn dự kiến';
  } else if (timeLeft <= 0) {
    status = 'alert';
    message = `Đã tới hạn ${name} dự kiến`;
  } else if (timeLeft <= day) {
    status = 'warning';
    message = `Còn ${Math.ceil(timeLeft / hour)} giờ đến hạn ${name}`;
  }

  return { status, message, limit, reminder, excess, detail };
}

export const bookingWarningLabels = {
  det: 'Cảnh báo hạn DET',
  dem: 'Cảnh báo hạn DEM',
  sailing: 'Đối chiếu ETD và ngày có thể tính phí',
};

export function bookingDeadlineWarnings(value, evidence = [], now = Date.now()) {
  const pickupActual = timestamp(value('bookingPickupActual'));
  const pickup = pickupActual || timestamp(value('pickupDate'));
  const gateActual = timestamp(value('bookingGateInActual'));
  const gatePlanned = timestamp(value('bookingGateInPlanned'));
  const gate = gateActual || gatePlanned || timestamp(value('cyCutoff'));
  const etd = timestamp(value('etd'));
  const atd = timestamp(value('bookingAtd'));
  const departure = atd || etd;
  const detDays = allowance(value('detFree'));
  const demDays = allowance(value('demFree'));
  const combinedDays = allowance(value('freeDays'));
  const workingDays = (field) =>
    evidence.some(
      (entry) =>
        entry.applicable &&
        entry.field === field &&
        /\b(?:working|business) days?\b/i.test(entry.quote),
    );
  const pickupSource = pickupActual ? 'ngày lấy rỗng thực tế' : 'ngày lấy rỗng dự kiến';
  const gateSource = gateActual
    ? 'gate-in thực tế'
    : gatePlanned
      ? 'gate-in dự kiến'
      : 'CY cut-off làm mốc hạ bãi dự kiến';

  let det, dem, combined;
  if (combinedDays !== null && (detDays !== null || demDays !== null)) {
    det = dem = pending('Có cả hạn gộp và hạn riêng. Cần xác nhận điều khoản áp dụng.');
  } else if (combinedDays !== null) {
    combined = deadline({
      name: 'DEM/DET gộp',
      start: pickup,
      days: combinedDays,
      end: departure,
      closed: !!atd,
      now,
      workingDays: workingDays('freeDays'),
      detail: pickup
        ? `Hạn gộp tính từ ${pickupSource}.`
        : 'Thiếu ngày lấy container rỗng để tính hạn gộp.',
    });
    det = dem = combined;
  } else {
    det = deadline({
      name: 'DET',
      start: pickup,
      days: detDays,
      end: gate,
      closed: !!gateActual,
      now,
      workingDays: workingDays('detFree'),
      detail:
        detDays === null || !pickup
          ? 'Cần ngày lấy container rỗng và số ngày Free DET.'
          : `Tính từ ${pickupSource}${gate ? ' đến ' + gateSource : ''}.`,
    });
    dem = deadline({
      name: 'DEM',
      start: gate,
      days: demDays,
      end: departure,
      closed: !!atd,
      now,
      workingDays: workingDays('demFree'),
      detail:
        demDays === null || !gate
          ? 'Cần mốc hạ bãi và số ngày Free DEM.'
          : `Tính từ ${gateSource}${departure ? (atd ? ' đến ATD.' : ' đến ETD chặng 1.') : '.'}`,
    });
  }

  let sailing;
  if (!etd) {
    sailing = pending('Cần ETD chặng 1 để đối chiếu lịch khởi hành.');
  } else {
    const estimates = combined
      ? [['DEM/DET gộp', combined]]
      : [
          ['DET', det],
          ['DEM', dem],
        ];
    const excess = estimates.some(([, item]) => item.excess > 0);
    const known = estimates.every(([, item]) => item.excess != null);
    const late = atd && earlier(etd, atd);
    const projection = excess
      ? 'Có nguy cơ vượt hạn miễn phí theo lịch dự kiến'
      : known
        ? 'ETD trong hạn miễn phí dự kiến'
        : 'Chưa đủ mốc để đối chiếu hạn miễn phí';
    const counts = estimates.map(([label, item]) =>
      item.excess == null
        ? `${label} cần xác nhận`
        : `${label} ${item.excess} ngày dự kiến tính phí`,
    );
    const dates = `ETD ${display(etd.instant, etd.hasTime)}${atd ? ' · ATD ' + display(atd.instant, atd.hasTime) : ''}`;
    sailing = {
      status: excess || late ? 'alert' : known && atd ? 'normal' : 'pending',
      message: atd ? departureTiming(etd, atd) : `Chưa có ATD · ${projection}`,
      detail: [
        dates,
        counts.join(' · '),
        excess ? 'Đối chiếu điều khoản hãng tàu để xác nhận phí.' : '',
      ]
        .filter(Boolean)
        .join('. '),
    };
  }

  const formatDeadline = ({ status, message, detail, excess, limit, reminder }) => ({
    status,
    message,
    detail,
    excess,
    deadline: limit === undefined ? '' : display(limit),
    reminder: reminder === undefined ? '' : display(reminder),
  });
  return {
    det: formatDeadline(det),
    dem: formatDeadline(dem),
    sailing,
  };
}
