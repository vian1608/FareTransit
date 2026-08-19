import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Booking from '../pages/BookingPage';
import { bookingAPI } from '../../../shared/api/api';
import { voucherAPI } from '../../../shared/api/voucherApi';
import { formatUsd, getCheckoutBasePricing } from './voucherCheckoutPricing';
import './BookingVoucherPage.css';

let currentVoucher = null;
let bookingApiPatched = false;

const PROCESSING_MESSAGES = [
  'Checking traveler and contact details…',
  'Securing your selected itinerary and final fare…',
  'Applying booking protections and preparing your reservation…',
  'Preparing your confirmation details…',
];

function lastFour(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function stripSensitivePaymentFields(source = {}) {
  const {
    cardNumber,
    card_number,
    pan,
    cvv,
    cvc,
    cch,
    securityCode,
    security_code,
    ...safe
  } = source || {};
  return safe;
}

function ensureBookingApiVoucherBridge() {
  if (bookingApiPatched) return;
  const originalCreate = bookingAPI.create.bind(bookingAPI);

  bookingAPI.create = (bookingData = {}) => {
    const safeBookingData = stripSensitivePaymentFields(bookingData);
    const safePaymentMethod = stripSensitivePaymentFields(safeBookingData.paymentMethod || {});
    const resolvedLast4 = lastFour(
      safePaymentMethod.cardLast4
      || safePaymentMethod.card_last4
      || safeBookingData.cardLast4
      || safeBookingData.card_last4,
    );

    const voucherAdjustedPrice = currentVoucher?.finalPrice;
    const hasVoucherPrice = Number.isFinite(Number(voucherAdjustedPrice));

    return originalCreate({
      ...safeBookingData,
      ...(hasVoucherPrice ? {
        customer_price: Number(voucherAdjustedPrice).toFixed(2),
        displayedWebsitePrice: Number(voucherAdjustedPrice).toFixed(2),
        price_before_voucher: Number(currentVoucher.priceBeforeVoucher || 0).toFixed(2),
        voucher_discount: Number(currentVoucher.appliedDiscount || 0).toFixed(2),
      } : {}),
      cardLast4: resolvedLast4,
      card_last4: resolvedLast4,
      paymentMethod: {
        ...safePaymentMethod,
        cardLast4: resolvedLast4,
        card_last4: resolvedLast4,
      },
      voucher_code: currentVoucher?.code || null,
    });
  };

  bookingApiPatched = true;
}

function findContactEmail() {
  const input = document.getElementById('contact-email')
    || document.querySelector('input[type="email"]');
  return String(input?.value || '').trim().toLowerCase();
}

function ensurePortalHost(id, beforeSelector, fallbackSelector) {
  let host = document.getElementById(id);
  if (host?.isConnected) return host;

  const before = document.querySelector(beforeSelector);
  const fallback = document.querySelector(fallbackSelector);
  const parent = before?.parentElement || fallback;
  if (!parent) return null;

  host = document.createElement('div');
  host.id = id;
  host.className = 'tfs-voucher-portal-host';
  if (before?.parentElement) before.parentElement.insertBefore(host, before);
  else fallback.appendChild(host);
  return host;
}

function ensureProcessingHost() {
  let host = document.getElementById('tfs-booking-processing-host');
  if (host?.isConnected) return host;

  const button = document.querySelector('.amtrak-btn.amtrak-btn--cta.amtrak-btn--full');
  if (!button?.parentElement) return null;

  host = document.createElement('div');
  host.id = 'tfs-booking-processing-host';
  button.insertAdjacentElement('afterend', host);
  return host;
}

function setTextIfChanged(node, value) {
  if (!node || node.textContent === value) return;
  node.textContent = value;
}

function syncDisplayedTotals(basePricing, appliedVoucher) {
  if (!basePricing) return;
  const finalPrice = appliedVoucher?.finalPrice ?? basePricing.priceBeforeVoucher;
  const finalText = `${formatUsd(finalPrice)} USD`;

  document.querySelectorAll('.booking-itinerary-pricing-summary__discounted').forEach((node) => {
    setTextIfChanged(node, finalText);
  });

  document.querySelectorAll('.price-total-amount').forEach((node) => {
    setTextIfChanged(node, finalText);
  });

  const mobileTotal = document.querySelector('.mobile-summary-toggle-bar strong');
  if (mobileTotal) {
    // Never rewrite this node when only whitespace/icon markup differs. The prior
    // implementation replaced the text and re-appended the icon on every observer
    // callback, which caused a self-triggering MutationObserver loop and froze Chrome.
    const currentText = String(mobileTotal.textContent || '').replace(/\s+/g, ' ').trim();
    if (currentText !== finalText) {
      const icon = mobileTotal.querySelector('i')?.cloneNode(true) || null;
      mobileTotal.textContent = finalText;
      if (icon) mobileTotal.append(' ', icon);
    }
  }

  const completeButton = document.querySelector('.amtrak-btn.amtrak-btn--cta.amtrak-btn--full');
  if (completeButton && !/Processing/i.test(completeButton.textContent || '')) {
    const desired = `🔒 Complete Secure Booking — ${formatUsd(finalPrice)} USD`;
    const labelNode = completeButton.querySelector('span') || completeButton;
    setTextIfChanged(labelNode, desired);
  }
}

function syncProcessingButton(setProcessing) {
  const button = document.querySelector('.amtrak-btn.amtrak-btn--cta.amtrak-btn--full');
  const processing = !!button && /Processing/i.test(button.textContent || '');
  if (button) button.classList.toggle('tfs-booking-processing-active', processing);
  setProcessing((current) => current === processing ? current : processing);
}

function ProcessingExperience({ passengerCount = 1 }) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % PROCESSING_MESSAGES.length);
    }, 3500);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="tfs-booking-processing-card" role="status" aria-live="polite" aria-atomic="true">
      <div className="tfs-booking-processing-card__top">
        <div className="tfs-booking-processing-card__shield" aria-hidden="true">
          <i className="fas fa-shield-alt" />
        </div>
        <div>
          <strong>We’re securing your reservation</strong>
          <p>{PROCESSING_MESSAGES[messageIndex]}</p>
        </div>
        <div className="tfs-booking-processing-card__dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
      <p className="tfs-booking-processing-card__note">
        <i className="fas fa-info-circle" aria-hidden="true" />
        Keep this page open. Please don’t refresh, press Back, or click the booking button again while we finish.
        {passengerCount > 1 ? ' Bookings with multiple travelers can take a little longer.' : ''}
      </p>
    </section>
  );
}

function VoucherCheckoutPanel({ basePricing, appliedVoucher, onApplied, onRemoved }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleApply = async () => {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      setError('Enter your voucher code.');
      return;
    }
    const email = findContactEmail();
    if (!email) {
      setError('Enter the primary contact email first so we can verify voucher eligibility and usage.');
      return;
    }
    if (!basePricing || basePricing.priceBeforeVoucher < 150) {
      setError('Vouchers require a booking amount of at least $150.00 after the standard website discount.');
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await voucherAPI.validate({
        code: normalizedCode,
        supplierPrice: basePricing.supplierPrice,
        priceBeforeVoucher: basePricing.priceBeforeVoucher,
        email,
      });
      const voucher = response?.data;
      if (!response?.success || !voucher) throw new Error('Voucher could not be validated.');
      onApplied({ ...voucher, validatedEmail: email });
      setMessage(voucher.message || `Voucher applied: ${formatUsd(voucher.appliedDiscount)} off.`);
    } catch (requestError) {
      const apiMessage = requestError?.response?.data?.error?.message
        || requestError?.userMessage
        || requestError?.message
        || 'This voucher could not be applied.';
      setError(apiMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tfs-voucher-checkout" aria-label="Voucher or coupon">
      <div className="tfs-voucher-checkout__header">
        <div>
          <span className="tfs-voucher-checkout__eyebrow">Have a voucher?</span>
          <h4>Voucher / Coupon</h4>
        </div>
        <i className="fas fa-ticket-alt" aria-hidden="true" />
      </div>

      {!appliedVoucher ? (
        <>
          <div className="tfs-voucher-checkout__controls">
            <input
              type="text"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="Enter voucher code"
              autoComplete="off"
              maxLength={40}
              aria-label="Voucher code"
            />
            <button type="button" onClick={handleApply} disabled={busy}>
              {busy ? <><i className="fas fa-circle-notch fa-spin" /> Checking…</> : 'Apply'}
            </button>
          </div>
          <p className="tfs-voucher-checkout__rule">
            Vouchers apply on bookings of <strong>$150+</strong>. Your final payment is protected at a minimum of <strong>60% of the ticket value</strong>.
          </p>
        </>
      ) : (
        <div className="tfs-voucher-applied">
          <div>
            <span className="tfs-voucher-applied__code">{appliedVoucher.code}</span>
            <strong>{formatUsd(appliedVoucher.appliedDiscount)} off</strong>
            <small>{appliedVoucher.capped ? 'Voucher capped by the 60% minimum-payment rule.' : 'Voucher successfully applied.'}</small>
          </div>
          <button type="button" onClick={onRemoved}>Remove</button>
        </div>
      )}

      {message && !error && <p className="tfs-voucher-message tfs-voucher-message--success">{message}</p>}
      {error && <p className="tfs-voucher-message tfs-voucher-message--error" role="alert">{error}</p>}

      {appliedVoucher && (
        <div className="tfs-voucher-price-example">
          <span>Price before voucher <strong>{formatUsd(appliedVoucher.priceBeforeVoucher)}</strong></span>
          <span>Voucher <strong>−{formatUsd(appliedVoucher.appliedDiscount)}</strong></span>
          <span className="tfs-voucher-price-example__final">Amount due <strong>{formatUsd(appliedVoucher.finalPrice)}</strong></span>
        </div>
      )}
    </section>
  );
}

function VoucherSidebarRow({ appliedVoucher }) {
  if (!appliedVoucher) return null;
  return (
    <div className="price-row tfs-voucher-sidebar-row">
      <span>Voucher {appliedVoucher.code}</span>
      <strong>−{formatUsd(appliedVoucher.appliedDiscount)}</strong>
    </div>
  );
}

function VoucherEnhancement() {
  const [paymentHost, setPaymentHost] = useState(null);
  const [sidebarHost, setSidebarHost] = useState(null);
  const [processingHost, setProcessingHost] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const basePricing = useMemo(() => getCheckoutBasePricing(), []);

  useEffect(() => {
    ensureBookingApiVoucherBridge();
    currentVoucher = null;
    sessionStorage.removeItem('tfsAppliedVoucher');

    const installHosts = () => {
      const payment = ensurePortalHost(
        'tfs-voucher-checkout-host',
        '.verification-block',
        '.card-payment-container',
      );
      const totalRow = document.querySelector('.price-breakdown-section .price-row--total');
      let sidebar = document.getElementById('tfs-voucher-sidebar-host');
      if (!sidebar?.isConnected && totalRow?.parentElement) {
        sidebar = document.createElement('div');
        sidebar.id = 'tfs-voucher-sidebar-host';
        totalRow.parentElement.insertBefore(sidebar, totalRow);
      }
      const processingStatusHost = ensureProcessingHost();
      if (payment) setPaymentHost((current) => current === payment ? current : payment);
      if (sidebar) setSidebarHost((current) => current === sidebar ? current : sidebar);
      if (processingStatusHost) setProcessingHost((current) => current === processingStatusHost ? current : processingStatusHost);
    };

    const syncCheckoutState = () => {
      installHosts();
      syncDisplayedTotals(basePricing, currentVoucher);
      syncProcessingButton(setProcessing);
    };

    let syncFrame = null;
    const scheduleSync = () => {
      if (syncFrame !== null) return;
      syncFrame = window.requestAnimationFrame(() => {
        syncFrame = null;
        syncCheckoutState();
      });
    };

    syncCheckoutState();
    const observer = new MutationObserver(scheduleSync);
    // Structural changes are enough for finding/reinstalling portal hosts. Watching
    // characterData caused our own price-label edits to recursively wake the observer.
    observer.observe(document.body, { childList: true, subtree: true });

    const clearOnEmailChange = (event) => {
      if (!currentVoucher) return;
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.id !== 'contact-email') return;
      const currentEmail = String(target.value || '').trim().toLowerCase();
      if (currentEmail !== currentVoucher.validatedEmail) {
        currentVoucher = null;
        setAppliedVoucher(null);
        sessionStorage.removeItem('tfsAppliedVoucher');
      }
    };

    const resyncAfterInput = scheduleSync;

    document.addEventListener('input', clearOnEmailChange, true);
    document.addEventListener('change', resyncAfterInput, true);
    document.addEventListener('click', resyncAfterInput, true);

    return () => {
      observer.disconnect();
      if (syncFrame !== null) {
        window.cancelAnimationFrame(syncFrame);
        syncFrame = null;
      }
      document.removeEventListener('input', clearOnEmailChange, true);
      document.removeEventListener('change', resyncAfterInput, true);
      document.removeEventListener('click', resyncAfterInput, true);
      document.querySelector('.tfs-booking-processing-active')?.classList.remove('tfs-booking-processing-active');
      currentVoucher = null;
      sessionStorage.removeItem('tfsAppliedVoucher');
    };
  }, [basePricing]);

  useEffect(() => {
    syncDisplayedTotals(basePricing, appliedVoucher);
  }, [basePricing, appliedVoucher]);

  const applyVoucher = (voucher) => {
    currentVoucher = voucher;
    setAppliedVoucher(voucher);
    sessionStorage.setItem('tfsAppliedVoucher', JSON.stringify(voucher));
    syncDisplayedTotals(basePricing, voucher);
  };

  const removeVoucher = () => {
    currentVoucher = null;
    setAppliedVoucher(null);
    sessionStorage.removeItem('tfsAppliedVoucher');
    syncDisplayedTotals(basePricing, null);
  };

  return (
    <>
      <style>{`
        .amtrak-btn.amtrak-btn--cta.amtrak-btn--full.tfs-booking-processing-active {
          opacity: 1 !important;
          filter: none !important;
          cursor: wait !important;
          background: linear-gradient(135deg, #a31342 0%, #7c0d32 100%) !important;
          box-shadow: 0 12px 28px rgba(139, 21, 56, 0.24) !important;
        }
        .tfs-booking-processing-card {
          margin-top: 14px;
          padding: 16px 18px;
          border: 1px solid #e7d2da;
          border-radius: 14px;
          background: linear-gradient(135deg, #fffafb 0%, #fff 100%);
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
          color: #334155;
        }
        .tfs-booking-processing-card__top {
          display: flex;
          align-items: center;
          gap: 13px;
        }
        .tfs-booking-processing-card__shield {
          width: 42px;
          height: 42px;
          flex: 0 0 42px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: #fbe8ee;
          color: #97143d;
        }
        .tfs-booking-processing-card__top > div:nth-child(2) {
          min-width: 0;
          flex: 1;
        }
        .tfs-booking-processing-card__top strong {
          display: block;
          color: #172033;
          font-size: 0.98rem;
          margin-bottom: 3px;
        }
        .tfs-booking-processing-card__top p {
          margin: 0;
          color: #64748b;
          font-size: 0.9rem;
          line-height: 1.45;
        }
        .tfs-booking-processing-card__dots {
          display: flex;
          gap: 5px;
          padding-left: 8px;
        }
        .tfs-booking-processing-card__dots span {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #97143d;
          animation: tfsBookingDot 1.2s infinite ease-in-out;
        }
        .tfs-booking-processing-card__dots span:nth-child(2) { animation-delay: 0.16s; }
        .tfs-booking-processing-card__dots span:nth-child(3) { animation-delay: 0.32s; }
        .tfs-booking-processing-card__note {
          margin: 13px 0 0;
          padding-top: 12px;
          border-top: 1px solid #f0e2e7;
          color: #64748b;
          font-size: 0.82rem;
          line-height: 1.5;
        }
        .tfs-booking-processing-card__note i {
          color: #97143d;
          margin-right: 6px;
        }
        @keyframes tfsBookingDot {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.38; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
        @media (max-width: 640px) {
          .tfs-booking-processing-card { padding: 14px; }
          .tfs-booking-processing-card__dots { display: none; }
          .tfs-booking-processing-card__top { align-items: flex-start; }
        }
      `}</style>
      {paymentHost && createPortal(
        <VoucherCheckoutPanel
          basePricing={basePricing}
          appliedVoucher={appliedVoucher}
          onApplied={applyVoucher}
          onRemoved={removeVoucher}
        />,
        paymentHost,
      )}
      {sidebarHost && createPortal(<VoucherSidebarRow appliedVoucher={appliedVoucher} />, sidebarHost)}
      {processing && processingHost && createPortal(
        <ProcessingExperience passengerCount={basePricing?.passengerCount || 1} />,
        processingHost,
      )}
    </>
  );
}

export default function BookingVoucherPage({ initialJourneyPayload = null }) {
  return (
    <>
      <Booking initialJourneyPayload={initialJourneyPayload} />
      <VoucherEnhancement />
    </>
  );
}