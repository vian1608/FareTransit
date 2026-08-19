import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReturnFlightSelection from '../flights/pages/ReturnFlightSelectionPage';
import BookingVoucherPage from '../bookings/vouchers/BookingVoucherPage';
import PaymentSuccessPage from '../bookings/pages/PaymentSuccessPage';
import { bookingAPI } from '../../shared/api/api';
import journeySessionAPI from '../../shared/api/journeySessionApi';

const DRAFT_SAVE_DELAY_MS = 1800;
const SENSITIVE_CONTROL_RE = /(cardnumber|expdate|cvv|cvc|cch|securitycode|security-code|pan)/i;

function JourneyState({ title, message, error = false, action }) {
  return (
    <div style={{ minHeight: '58vh', display: 'grid', placeItems: 'center', padding: '2rem 1rem', background: '#f8fafc' }}>
      <div style={{ width: 'min(680px, 100%)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: '2.2rem', boxShadow: '0 16px 40px rgba(15,23,42,.08)', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', display: 'grid', placeItems: 'center', margin: '0 auto 1rem', background: error ? '#fff1f2' : '#f5f3ff', color: error ? '#be123c' : '#8b1538', fontSize: 26 }}>
          <i className={`fas ${error ? 'fa-exclamation-triangle' : 'fa-circle-notch fa-spin'}`} />
        </div>
        <h2 style={{ margin: '0 0 .65rem', color: '#172033' }}>{title}</h2>
        <p style={{ margin: 0, color: '#64748b', lineHeight: 1.65 }}>{message}</p>
        {action}
      </div>
    </div>
  );
}

function readJsonStorage(key, fallback = null) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function seedTravelStorage(payload = {}, { quoteToken = null, checkoutToken = null } = {}) {
  if (payload.searchParams) {
    sessionStorage.setItem('searchParams', JSON.stringify(payload.searchParams));
    sessionStorage.setItem('searchType', payload.searchParams.tripType || (payload.searchParams.returnDate ? 'roundtrip' : 'oneway'));
  }
  if (payload.selectedFlight) {
    sessionStorage.setItem('selectedFlight', JSON.stringify(payload.selectedFlight));
  }
  if (payload.returnFlight) {
    sessionStorage.setItem('returnFlight', JSON.stringify(payload.returnFlight));
    sessionStorage.setItem('selectedReturnFlight', JSON.stringify(payload.returnFlight));
  } else {
    sessionStorage.removeItem('returnFlight');
    sessionStorage.removeItem('selectedReturnFlight');
  }
  if (quoteToken) sessionStorage.setItem('quoteSessionToken', quoteToken);
  if (checkoutToken) sessionStorage.setItem('checkoutSessionToken', checkoutToken);
}

let bookingSessionBridgeInstalled = false;
function ensureBookingSessionBridge() {
  if (bookingSessionBridgeInstalled) return;
  const originalCreate = bookingAPI.create.bind(bookingAPI);

  bookingAPI.create = async (bookingData = {}) => {
    const checkoutToken = sessionStorage.getItem('checkoutSessionToken');
    const response = await originalCreate({
      ...bookingData,
      ...(checkoutToken ? { checkout_session_token: checkoutToken } : {}),
    });

    const readToken = response?.reservationReadToken || response?.data?.reservationReadToken || null;
    const confirmationCode = response?.data?.booking?.confirmation_code
      || response?.data?.booking?.confirmationCode
      || response?.data?.confirmation_code
      || response?.data?.confirmationCode
      || response?.confirmation_code
      || response?.confirmationCode
      || null;

    if (readToken && confirmationCode) {
      sessionStorage.setItem(`reservationReadToken:${confirmationCode}`, readToken);
    }
    return response;
  };

  bookingSessionBridgeInstalled = true;
}

let reservationReadBridgeInstalled = false;
function ensureReservationReadBridge() {
  if (reservationReadBridgeInstalled) return;
  const originalConfirmation = bookingAPI.getConfirmationDTO.bind(bookingAPI);
  const originalReference = bookingAPI.getByReference.bind(bookingAPI);

  bookingAPI.getConfirmationDTO = (reference) => String(reference || '').startsWith('r_')
    ? journeySessionAPI.getReservation(reference)
    : originalConfirmation(reference);
  bookingAPI.getByReference = (reference) => String(reference || '').startsWith('r_')
    ? journeySessionAPI.getReservation(reference)
    : originalReference(reference);

  reservationReadBridgeInstalled = true;
}

function allDraftControls() {
  return Array.from(document.querySelectorAll('.booking-form-area form input, .booking-form-area form select, .booking-form-area form textarea'));
}

function isSensitiveControl(control) {
  const identity = `${control.id || ''} ${control.name || ''} ${control.getAttribute('autocomplete') || ''}`;
  return control.type === 'password' || SENSITIVE_CONTROL_RE.test(identity);
}

function draftKey(control, index) {
  if (control.id) return `id:${control.id}`;
  if (control.name) return `name:${control.name}`;
  return `idx:${index}`;
}

function collectFormDraft() {
  const controls = allDraftControls();
  const values = [];
  controls.forEach((control, index) => {
    if (isSensitiveControl(control)) return;
    values.push({
      key: draftKey(control, index),
      type: control.type || control.tagName.toLowerCase(),
      value: control.type === 'checkbox' || control.type === 'radio' ? undefined : control.value,
      checked: control.type === 'checkbox' || control.type === 'radio' ? !!control.checked : undefined,
    });
  });

  return {
    values,
    billingExpanded: !!document.getElementById('billingAddress'),
    savedAt: new Date().toISOString(),
  };
}

function setNativeValue(control, value) {
  const proto = control instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(control, value ?? '');
  else control.value = value ?? '';
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

function setNativeChecked(control, checked) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
  if (setter) setter.call(control, !!checked);
  else control.checked = !!checked;
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

function restoreDraftValues(draft) {
  if (!draft?.values?.length) return;
  const controls = allDraftControls();
  const byKey = new Map();
  controls.forEach((control, index) => byKey.set(draftKey(control, index), control));

  draft.values.forEach((saved) => {
    const control = byKey.get(saved.key);
    if (!control || isSensitiveControl(control)) return;
    if (control.type === 'checkbox' || control.type === 'radio') setNativeChecked(control, saved.checked);
    else setNativeValue(control, saved.value);
  });
}

function restoreVoucher(voucher) {
  if (!voucher?.code) return;
  window.setTimeout(() => {
    const input = document.querySelector('.tfs-voucher-checkout input[aria-label="Voucher code"]');
    if (!input) return;
    const section = input.closest('.tfs-voucher-checkout');
    if (!section || section.querySelector('.tfs-voucher-applied')) return;
    setNativeValue(input, voucher.code);
    const button = Array.from(section.querySelectorAll('button')).find((node) => /apply/i.test(node.textContent || ''));
    button?.click();
  }, 1150);
}

function restoreCheckoutDraft(payload = {}) {
  const draft = payload.formDraft;
  if (draft) {
    const run = () => {
      if (draft.billingExpanded && !document.getElementById('billingAddress')) {
        document.querySelector('.btn-add-billing')?.click();
        window.setTimeout(() => restoreDraftValues(draft), 80);
      } else {
        restoreDraftValues(draft);
      }
    };
    window.setTimeout(run, 160);
    window.setTimeout(run, 700);
  }
  restoreVoucher(payload.voucher);
}

function CheckoutDraftPersistence({ token, initialPayload }) {
  const payloadRef = useRef(initialPayload || {});
  const timerRef = useRef(null);
  const lastSerializedRef = useRef('');

  useEffect(() => {
    payloadRef.current = initialPayload || {};
    restoreCheckoutDraft(payloadRef.current);

    const save = () => {
      const formDraft = collectFormDraft();
      const voucher = readJsonStorage('tfsAppliedVoucher', null);
      const nextPayload = {
        ...payloadRef.current,
        formDraft,
        voucher,
      };
      const serialized = JSON.stringify({ formDraft, voucher });
      if (serialized === lastSerializedRef.current) return;
      lastSerializedRef.current = serialized;
      payloadRef.current = nextPayload;
      journeySessionAPI.updateCheckout(token, { payload: nextPayload }).catch(() => {/* non-blocking draft save */});
    };

    const schedule = () => {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(save, DRAFT_SAVE_DELAY_MS);
    };

    document.addEventListener('input', schedule, true);
    document.addEventListener('change', schedule, true);
    document.addEventListener('click', schedule, true);

    return () => {
      window.clearTimeout(timerRef.current);
      document.removeEventListener('input', schedule, true);
      document.removeEventListener('change', schedule, true);
      document.removeEventListener('click', schedule, true);
    };
  }, [token, initialPayload]);

  return null;
}

export function ReturnFlightBootstrap() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const selectedFlight = readJsonStorage('selectedFlight');
    const searchParams = readJsonStorage('searchParams', {});
    if (!selectedFlight || !searchParams?.returnDate) {
      setError('We could not find the departure selection needed to build a return-flight link. Please select the departure flight again.');
      return undefined;
    }

    sessionStorage.removeItem('quoteSessionToken');
    sessionStorage.removeItem('checkoutSessionToken');
    journeySessionAPI.createQuote({ searchParams, selectedFlight })
      .then((response) => {
        if (cancelled) return;
        const token = response?.data?.token;
        if (!token) throw new Error('The server did not return a quote-session link.');
        sessionStorage.setItem('quoteSessionToken', token);
        navigate(`/return-flight/${encodeURIComponent(token)}`, { replace: true });
      })
      .catch((err) => !cancelled && setError(err?.userMessage || err?.message || 'Unable to create a return-flight session.'));

    return () => { cancelled = true; };
  }, [navigate]);

  if (error) {
    return <JourneyState error title="Departure selection needs attention" message={error} action={<button type="button" onClick={() => navigate('/')} style={{ marginTop: 18, padding: '.8rem 1.2rem' }}>Search flights</button>} />;
  }
  return <JourneyState title="Preparing your return-flight link" message="We’re securing the selected departure and the supplier round-trip quote so this page can be refreshed, duplicated, or copied safely." />;
}

export function TokenizedReturnFlightPage() {
  const { quoteToken } = useParams();
  const [state, setState] = useState({ loading: true, error: '' });

  useEffect(() => {
    let cancelled = false;
    journeySessionAPI.getQuote(quoteToken)
      .then((response) => {
        if (cancelled) return;
        const payload = response?.data?.payload;
        if (!payload?.selectedFlight || !payload?.searchParams) throw new Error('This quote link does not contain a complete departure selection.');
        seedTravelStorage(payload, { quoteToken });
        setState({ loading: false, error: '' });
      })
      .catch((err) => !cancelled && setState({ loading: false, error: err?.userMessage || err?.message || 'Unable to restore this return-flight link.' }));
    return () => { cancelled = true; };
  }, [quoteToken]);

  if (state.loading) return <JourneyState title="Restoring your departure selection" message="Loading the exact outbound flight and round-trip quote attached to this link." />;
  if (state.error) return <JourneyState error title="This return-flight link cannot be restored" message={state.error} />;
  return <ReturnFlightSelection />;
}

export function BookingBootstrap() {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const selectedFlight = readJsonStorage('selectedFlight');
    const returnFlight = readJsonStorage('returnFlight') || readJsonStorage('selectedReturnFlight');
    const searchParams = readJsonStorage('searchParams', {});
    const quoteToken = sessionStorage.getItem('quoteSessionToken') || null;

    if (!selectedFlight || !searchParams?.fromCode || !searchParams?.toCode) {
      setError('We could not find the selected itinerary needed to create a secure checkout link. Please select the flight again.');
      return undefined;
    }

    sessionStorage.removeItem('checkoutSessionToken');
    journeySessionAPI.createCheckout({ searchParams, selectedFlight, returnFlight, quoteToken })
      .then((response) => {
        if (cancelled) return;
        const token = response?.data?.token;
        if (!token) throw new Error('The server did not return a checkout-session link.');
        sessionStorage.setItem('checkoutSessionToken', token);
        navigate(`/booking/${encodeURIComponent(token)}`, { replace: true });
      })
      .catch((err) => !cancelled && setError(err?.userMessage || err?.message || 'Unable to create a secure checkout session.'));

    return () => { cancelled = true; };
  }, [navigate]);

  if (error) return <JourneyState error title="Checkout link needs attention" message={error} />;
  return <JourneyState title="Creating your secure checkout link" message="Saving the itinerary behind an opaque checkout ID so refresh, duplicate tab, and copy/paste all restore the same trip." />;
}

export function TokenizedBookingPage() {
  const { checkoutToken } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  ensureBookingSessionBridge();

  useEffect(() => {
    let cancelled = false;
    setError('');
    setSession(null);
    journeySessionAPI.getCheckout(checkoutToken)
      .then((response) => {
        if (cancelled) return;
        const data = response?.data;
        const payload = data?.payload;
        if (data?.status === 'COMPLETED' && data?.reservationToken) {
          navigate(`/booking-confirmed/${encodeURIComponent(data.reservationToken)}`, { replace: true });
          return;
        }
        if (!payload?.selectedFlight || !payload?.searchParams) throw new Error('This checkout link does not contain a complete itinerary.');
        seedTravelStorage(payload, { quoteToken: payload.quoteToken || null, checkoutToken });
        setSession(data);
      })
      .catch((err) => !cancelled && setError(err?.userMessage || err?.message || 'Unable to restore this checkout link.'));
    return () => { cancelled = true; };
  }, [checkoutToken, navigate, reloadKey]);

  if (error) return (
    <JourneyState
      error
      title="This checkout link cannot be restored"
      message={error}
      action={(
        <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setReloadKey((current) => current + 1)}
            style={{ padding: '.8rem 1.15rem', borderRadius: 10, border: 0, background: '#8b1538', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            Retry checkout
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{ padding: '.8rem 1.15rem', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer' }}
          >
            Search flights
          </button>
        </div>
      )}
    />
  );
  if (!session) return <JourneyState title="Restoring your secure checkout" message="Loading the exact itinerary and saved non-sensitive form progress attached to this checkout link." />;

  return (
    <>
      <BookingVoucherPage initialJourneyPayload={session.payload || {}} />
      <CheckoutDraftPersistence token={checkoutToken} initialPayload={session.payload || {}} />
    </>
  );
}

export function BookingConfirmationRoute() {
  const { confirmationCode } = useParams();
  const navigate = useNavigate();

  ensureReservationReadBridge();

  useEffect(() => {
    if (!confirmationCode || confirmationCode.startsWith('r_')) return;
    const readToken = sessionStorage.getItem(`reservationReadToken:${confirmationCode}`);
    if (readToken?.startsWith('r_')) {
      navigate(`/booking-confirmed/${encodeURIComponent(readToken)}`, { replace: true });
    }
  }, [confirmationCode, navigate]);

  return <PaymentSuccessPage />;
}

export function LegacyPaymentSuccessRoute() {
  ensureReservationReadBridge();
  return <PaymentSuccessPage />;
}
