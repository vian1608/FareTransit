from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one patch target, found {count}")
    p.write_text(text.replace(old, new, 1))


replace_once(
    'backend/src/modules/admin/admin.controller.mjs',
    """        const sCents = splits.length > 0
          ? splits.reduce((sum, s) => sum + Math.round(Number(s.amount || 0) * 100), 0)
          : bCents;

        if (splits.length > 0 && Math.abs(sCents - bCents) !== 0) {
""",
    """        const sCents = splits.length > 0
          ? splits.reduce((sum, s) => sum + Math.round(Number(s.amount || 0) * 100), 0)
          : 0;

        if (splits.length === 0) {
          return res.status(400).json({
            success: false,
            requestId: reqId,
            emailType: 'authorization',
            error: {
              code: 'PAYMENT_SPLITS_REQUIRED',
              message: `Save a payment breakdown before sending the authorization email. Add one or more merchant splits totaling $${(bCents / 100).toFixed(2)}.`
            }
          });
        }

        if (Math.abs(sCents - bCents) !== 0) {
""",
)

replace_once(
    'frontend/src/features/admin/components/AdminBookingManagementPanel.js',
    """    if (type === 'final_ticket') {
      const pnr = text(booking.airline_confirmation_number || booking.airlineConfirmationNumber || booking.airline_pnr || booking.pnr).trim().toUpperCase();
""",
    """    if (type === 'authorization') {
      const savedSplits = booking.payment_splits || booking.paymentSplits || [];
      const bookingTotal = num(booking.customer_price ?? booking.total_amount ?? pricingForm.customerTotal, 0);
      const splitTotal = savedSplits.reduce((sum, split) => sum + Math.round(num(split.amount, 0) * 100), 0) / 100;

      if (!savedSplits.length) {
        const message = `Authorization email needs a saved payment breakdown totaling ${money(bookingTotal, booking.currency || pricingForm.currency)}. Add the merchant split(s) below and click Save Payment first.`;
        setMessage('emails', 'error', message);
        setMessage('payment', 'error', message);
        window.requestAnimationFrame(() => {
          const section = document.getElementById('payment-splits-section');
          if (section) {
            section.open = true;
            section.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
        return;
      }

      if (Math.abs(splitTotal - bookingTotal) > 0.001) {
        const message = `Saved payment splits total ${money(splitTotal, booking.currency || pricingForm.currency)}, but the booking total is ${money(bookingTotal, booking.currency || pricingForm.currency)}. Correct the split amounts and click Save Payment before sending.`;
        setMessage('emails', 'error', message);
        setMessage('payment', 'error', message);
        window.requestAnimationFrame(() => {
          const section = document.getElementById('payment-splits-section');
          if (section) {
            section.open = true;
            section.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
        return;
      }
    }

    if (type === 'final_ticket') {
      const pnr = text(booking.airline_confirmation_number || booking.airlineConfirmationNumber || booking.airline_pnr || booking.pnr).trim().toUpperCase();
""",
)

replace_once(
    'frontend/src/features/admin/components/AdminBookingManagementPanel.js',
    """      <details className=\"abm-section\" open>
        <summary><strong>5. Payment & Splits</strong><span>Payment state, transaction reference and merchant split amounts</span></summary>
        <div className=\"abm-toolbar\"><button className=\"abm-button abm-button--secondary\" type=\"button\" onClick={() => setPaymentSplits(current => [...current, { _key: `split-${Date.now()}`, merchantName: 'FareTransit LLC', amount: '0.00' }])}>+ Add Payment Split</button></div>
""",
    """      <details id=\"payment-splits-section\" className=\"abm-section\" open>
        <summary><strong>5. Payment & Splits</strong><span>Payment state, transaction reference and merchant split amounts</span></summary>
        <div className=\"abm-toolbar\">
          <button className=\"abm-button abm-button--secondary\" type=\"button\" onClick={() => setPaymentSplits(current => [...current, { _key: `split-${Date.now()}`, merchantName: 'FareTransit LLC', amount: '0.00' }])}>+ Add Payment Split</button>
          {!paymentSplits.length && num(pricingForm.customerTotal, 0) > 0 && <button className=\"abm-button abm-button--secondary\" type=\"button\" onClick={() => setPaymentSplits([{ _key: `split-${Date.now()}`, merchantName: 'FareTransit LLC', amount: num(pricingForm.customerTotal, 0).toFixed(2) }])}>Use Customer Total as One Split</button>}
        </div>
""",
)

backend = Path('backend/src/modules/admin/admin.controller.mjs').read_text()
frontend = Path('frontend/src/features/admin/components/AdminBookingManagementPanel.js').read_text()
assert "code: 'PAYMENT_SPLITS_REQUIRED'" in backend
assert 'Authorization email needs a saved payment breakdown' in frontend
assert 'Use Customer Total as One Split' in frontend
assert 'payment-splits-section' in frontend
print('authorization email payment split guard patch applied')
