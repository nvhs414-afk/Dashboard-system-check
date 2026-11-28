import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bookingFreeTime,
  combinedFreeTimeTerm,
  resolveFreeTime,
  standardDetTerm,
} from '../src/booking-free-time.js';
import { makeRadar } from '../src/booking-radar.js';
import { extractFields } from '../src/extraction.js';

test('Booking reads separately stated DEM and DET, including across a wrapped line', () => {
  const text = [
    '[Trang 1]',
    'Equipment Type : Dry Container Equipment Size : 4H',
    'Commodity Code : 9403000007 Commodity Desc. : FURNITURE Flex EQ : No',
    'RF : No DG : No',
    '[Trang 2]',
    'Remarks: Free 6DET +',
    '7DEM for DC-general cargo. Free 7DET + 5DEM for Reefer.',
    'Free 5DET+5DEM for Dry-DG, RD, FR, OT.',
  ].join('\n');
  const evidence = bookingFreeTime(text);
  assert.deepEqual(resolveFreeTime(evidence), { demFree: '7', detFree: '6' });
  assert.ok(
    evidence.some(
      (entry) =>
        entry.page === 2 &&
        entry.applicable &&
        entry.commodity === 'FURNITURE' &&
        /DC-general/.test(entry.quote),
    ),
  );
  assert.ok(evidence.some((entry) => !entry.applicable && /Reefer/.test(entry.quote)));
  const fields = extractFields('booking', text);
  assert.equal(fields.demFree, '7');
  assert.equal(fields.detFree, '6');
  assert.equal(fields.freeDays, undefined);

  const radar = makeRadar(
    (key) =>
      ({ ...fields, bookingNo: 'DEMOBOOKING', pickupDate: '2026/04/01', etd: '2026/04/20' })[key] ||
      '',
  );
  assert.match(
    radar.lines.find(({ title }) => title.includes('Free time')).detail,
    /Free DEM 7 ngày · Free DET 6 ngày/,
  );
  assert.equal(
    radar.checks.some(({ title }) => /DEM\/DET/.test(title)),
    false,
  );
});

test('same equipment and cargo flags can have different free time by commodity', () => {
  const booking = 'Equipment Type: Dry Container\nRF: No DG: No\n';
  const terms = 'Free 4DET + 8DEM for furniture cargo. For textiles: Free 2DET + 5DEM.';
  const extract = (description) =>
    resolveFreeTime(bookingFreeTime(`${booking}Commodity Desc. : ${description}\n${terms}`));
  assert.deepEqual(extract('WOODEN FURNITURE Flex EQ : No'), { demFree: '8', detFree: '4' });
  assert.deepEqual(extract('TEXTILES'), { demFree: '5', detFree: '2' });
  assert.deepEqual(extract('FOOD'), {});
  assert.deepEqual(extract(''), {});
});

test('commodity exceptions and conflicting cargo details are respected', () => {
  const booking = 'Equipment Type: Dry Container\nRF: No DG: No\n';
  const general = 'Free 6DET + 7DEM for DC-general cargo.';
  const special = 'Free 5DET+5DEM for Dry-DG, RD, FR, OT.';
  const extract = (text) => resolveFreeTime(bookingFreeTime(text));
  assert.deepEqual(extract(`${booking}Commodity Desc: FURNITURE\n${general} ${special}`), {
    demFree: '7',
    detFree: '6',
  });
  assert.deepEqual(
    extract(
      `${booking.replace('DG: No', 'DG: Yes')}Commodity Desc: FURNITURE\n${general} ${special}`,
    ),
    { demFree: '5', detFree: '5' },
  );
  assert.deepEqual(extract(`${booking}Commodity Desc: DANGEROUS GOODS\n${general} ${special}`), {});
  assert.deepEqual(
    extract(
      `${booking}Commodity Desc: FURNITURE\nFree 6DET + 7DEM for DC-general cargo except furniture.`,
    ),
    {},
  );
});

test('explicit combined days fill only the combined field', () => {
  for (const text of ['Combined D&D 14 calendar days', 'DET + DEM (Free time): 14 days']) {
    assert.deepEqual(resolveFreeTime(bookingFreeTime(text)), { freeDays: '14' });
  }
  assert.deepEqual(resolveFreeTime(bookingFreeTime('DEM: 5 days, DET: 7 days')), {
    demFree: '5',
    detFree: '7',
  });
  assert.deepEqual(resolveFreeTime(bookingFreeTime('Free time: 7 days free demurrage')), {
    demFree: '7',
  });
});

test('ambiguous terms and contradictions keep the relevant fields pending', () => {
  const text = 'DEM: 5 days. Free DEM: 6 days. DET: 7 days.';
  assert.deepEqual(resolveFreeTime(bookingFreeTime(text)), { detFree: '7' });
  const tariff = bookingFreeTime("D&D as per carrier's tariff");
  assert.equal(tariff[0].field, 'tariff');
  assert.deepEqual(resolveFreeTime(tariff), {});
  for (const text of [
    'DEM/DET 5+7',
    'Free time: 7/7',
    'Storage free at CFS: 5 days',
    'Terms: FIOS',
  ]) {
    assert.deepEqual(resolveFreeTime(bookingFreeTime(text)), {});
  }
  assert.deepEqual(resolveFreeTime(bookingFreeTime('Free 6DET + 7DEM for DC-general cargo')), {});
});

test('apply only the declared service row and ignore the CY cut-off schedule', () => {
  const text = [
    '[Trang 1]',
    'SERVICE I11',
    '[Trang 2]',
    'Service  Proforma ETD  CY Cut off at Terminal  Cut off at ICDs',
    'I11  Thu  Wed 03:00 PM  Tue 07:00 PM',
    'Service | Free DEM (days) | DET (calendar days)',
    'I10 | 3 | 4',
    'I11 | 5 | 6',
    'Additional detention charge exceeds standard free time (7 calendar days).',
  ].join('\n');
  const evidence = bookingFreeTime(text);
  assert.deepEqual(resolveFreeTime(evidence), { demFree: '5', detFree: '6' });
  assert.equal(standardDetTerm(evidence), undefined);
  assert.ok(
    evidence.some(({ service, applicable, page }) => service === 'I11' && applicable && page === 2),
  );
  assert.ok(evidence.some(({ service, applicable }) => service === 'I10' && !applicable));
  assert.ok(!evidence.some(({ quote }) => quote.includes('Proforma ETD')));
  assert.deepEqual(resolveFreeTime(bookingFreeTime(text.replace('I11 | 5 | 6', 'I11  6'))), {
    detFree: '7',
  });
});

test('a default DET clause applies only when no contract or combined days supersede it', () => {
  const standard =
    'Additional detention charge is applicable after standard free time (7 calendar days).';
  const booking = 'Service Code: I11\n' + standard;
  const extract = (other) => resolveFreeTime(bookingFreeTime(booking + '\n' + other));
  assert.deepEqual(extract('Combined Demurrage Detention tariff is available online.'), {
    detFree: '7',
  });
  assert.deepEqual(
    extract('For service I11: Free DET: 10 days. Free DET: 3 days for service I10.'),
    { detFree: '10' },
  );
  assert.deepEqual(extract('DET as per agreement. DET as per contract.'), {});
  assert.deepEqual(extract('Combined Demurrage Detention: 12 calendar days.'), { freeDays: '12' });
  assert.deepEqual(
    resolveFreeTime(
      bookingFreeTime('Combined Demurrage and Detention standard free time: 12 calendar days.'),
    ),
    { freeDays: '12' },
  );
});

test('free time from empty pickup through vessel loading fills only the combined allowance', () => {
  const quote =
    'Additional detention charge applies beyond standard free time (7 calendar days\nincluding empty pick up date + load date).';
  const evidence = bookingFreeTime(quote + '\nDEM: 5 days. DET: 6 days.');
  assert.deepEqual(resolveFreeTime(evidence), { freeDays: '7' });
  assert.deepEqual(combinedFreeTimeTerm(evidence), {
    value: '7',
    needReview: true,
    throughLoad: true,
  });

  const explicit = bookingFreeTime('Combined DEM/DET free time: 10 calendar days.');
  assert.deepEqual(combinedFreeTimeTerm(explicit), {
    value: '10',
    needReview: false,
    throughLoad: false,
  });

  const byRange = bookingFreeTime(
    'Free time: 8 calendar days from empty-container pick-up until loading.',
  );
  assert.deepEqual(combinedFreeTimeTerm(byRange), {
    value: '8',
    needReview: false,
    throughLoad: true,
  });
  assert.deepEqual(
    resolveFreeTime(
      bookingFreeTime('Miễn phí 7 ngày tính từ ngày lấy container rỗng đến ngày xếp tàu.'),
    ),
    { freeDays: '7' },
  );
  assert.deepEqual(resolveFreeTime([...evidence, ...explicit]), {});
  assert.equal(combinedFreeTimeTerm([...evidence, ...explicit]).needReview, true);
});
