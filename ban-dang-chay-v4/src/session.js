export const state = {
  queue: [],
  seen: new Set(),
  manual: new Set(),
  form: {},
  scanning: false,
  checks: [],
  draft: null,
  active: 'invoice',
  notice: '',
  showAll: false,
};
export function value(k) {
  return String(state.form[k] ?? '').trim();
}

export function packingGrossForInvoice() {
  const invoiceNo = value('invoiceNo').toUpperCase();
  if (!invoiceNo || value('invoiceGross') || state.manual.has('invoiceGross')) return '';

  const totals = new Set(
    state.queue
      .filter(
        (item) =>
          item.type === 'packing' &&
          item.status === 'Đã nhận diện' &&
          item.fields.plInvoiceNo?.toUpperCase() === invoiceNo,
      )
      .map((item) => item.fields.plGross)
      .filter(Boolean),
  );
  return totals.size === 1 ? [...totals][0] : '';
}

