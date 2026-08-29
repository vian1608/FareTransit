import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

const apiBase = () => (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? (process.env.REACT_APP_API_URL || 'http://localhost:5001/api')
  : '/api';

async function jsonRequest(path, options = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const error = new Error(body?.error?.message || body?.message || `Request failed (HTTP ${response.status})`);
    error.status = response.status;
    error.code = body?.error?.code;
    throw error;
  }
  return body.data ?? body;
}

function loadCollectJs(tokenizationKey) {
  if (typeof window === 'undefined') return Promise.reject(new Error('Payment fields are unavailable.'));
  if (window.CollectJS) return Promise.resolve(window.CollectJS);
  if (window.__fareTransitCollectJsPromise) return window.__fareTransitCollectJsPromise;

  window.__fareTransitCollectJsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-faretransit-nmi-collect="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.CollectJS), { once: true });
      existing.addEventListener('error', () => reject(new Error('Unable to load secure payment fields.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://secure.nmi.com/token/Collect.js';
    script.async = true;
    script.setAttribute('data-tokenization-key', tokenizationKey);
    script.setAttribute('data-variant', 'inline');
    script.setAttribute('data-faretransit-nmi-collect', 'true');
    script.onload = () => window.CollectJS ? resolve(window.CollectJS) : reject(new Error('Secure payment fields did not initialize.'));
    script.onerror = () => reject(new Error('Unable to load secure payment fields.'));
    document.head.appendChild(script);
  });

  return window.__fareTransitCollectJsPromise;
}

const parseCardMetadata = (response = {}) => {
  const maskedNumber = String(response?.card?.number || '');
  const digits = maskedNumber.replace(/\D/g, '');
  const exp = String(response?.card?.exp || '').replace(/\D/g, '');
  const yy = exp.length >= 4 ? Number(exp.slice(2, 4)) : null;
  return {
    cardBrand: String(response?.card?.type || '').trim() || null,
    last4: digits.length >= 4 ? digits.slice(-4) : null,
    expMonth: exp.length >= 2 ? Number(exp.slice(0, 2)) : null,
    expYear: Number.isFinite(yy) ? 2000 + yy : null,
  };
};

const ManualPaymentCardFields = forwardRef(function ManualPaymentCardFields({ onFocus }, ref) {
  const publicKey = String(process.env.REACT_APP_NMI_TOKENIZATION_KEY || '').trim();
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [validation, setValidation] = useState({ ccnumber: false, ccexp: false, cvv: false });
  const pendingTokenRequest = useRef(null);
  const lastMetadata = useRef({ cardBrand: null, last4: null, expMonth: null, expYear: null });

  const rejectPending = useCallback((message) => {
    if (!pendingTokenRequest.current) return;
    const { reject, timer } = pendingTokenRequest.current;
    clearTimeout(timer);
    pendingTokenRequest.current = null;
    reject(new Error(message));
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!publicKey) {
      setLoadError('Secure card fields are not configured. Add REACT_APP_NMI_TOKENIZATION_KEY to the frontend environment.');
      return undefined;
    }

    loadCollectJs(publicKey)
      .then((CollectJS) => {
        if (!mounted || !CollectJS) return;
        CollectJS.configure({
          variant: 'inline',
          fields: {
            ccnumber: {
              selector: '#faretransit-nmi-ccnumber',
              title: 'Card Number',
              placeholder: '0000 0000 0000 0000',
              enableCardBrandPreviews: true,
            },
            ccexp: {
              selector: '#faretransit-nmi-ccexp',
              title: 'Card Expiration',
              placeholder: 'MM / YY',
            },
            cvv: {
              display: 'required',
              selector: '#faretransit-nmi-cvv',
              title: 'Security Code',
              placeholder: 'CVV',
            },
          },
          customCss: {
            'background-color': '#ffffff',
            color: '#172033',
            'font-size': '15px',
            'font-family': '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
            padding: '11px 12px',
            'border-radius': '10px',
            border: '1px solid #cbd5e1',
            height: '44px',
          },
          focusCss: { 'border-color': '#8b1538', 'box-shadow': '0 0 0 2px rgba(139,21,56,.12)' },
          validCss: { 'border-color': '#16a34a' },
          invalidCss: { 'border-color': '#dc2626' },
          validationCallback: (field, status) => {
            if (!mounted) return;
            setValidation((prev) => ({ ...prev, [field]: Boolean(status) }));
            if (status && typeof onFocus === 'function') onFocus();
          },
          fieldsAvailableCallback: () => mounted && setReady(true),
          timeoutDuration: 12000,
          timeoutCallback: () => rejectPending('The secure card fields did not respond. Check the card details and try again.'),
          callback: (response) => {
            const request = pendingTokenRequest.current;
            if (!request) return;
            clearTimeout(request.timer);
            pendingTokenRequest.current = null;
            const metadata = parseCardMetadata(response);
            lastMetadata.current = metadata;
            request.resolve({ token: response?.token, ...metadata });
          },
        });
      })
      .catch((err) => mounted && setLoadError(err.message || 'Unable to load secure payment fields.'));

    return () => {
      mounted = false;
      rejectPending('Payment entry was interrupted. Please try again.');
    };
  }, [publicKey, onFocus, rejectPending]);

  const tokenize = useCallback(async () => {
    if (!ready || !window.CollectJS) throw new Error(loadError || 'Secure card fields are still loading.');
    if (!validation.ccnumber || !validation.ccexp || !validation.cvv) {
      throw new Error('Enter a valid card number, expiration date, and security code.');
    }
    if (pendingTokenRequest.current) throw new Error('Card details are already being secured.');

    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pendingTokenRequest.current = null;
        reject(new Error('Card tokenization timed out. Please verify the card details and try again.'));
      }, 15000);
      pendingTokenRequest.current = { resolve, reject, timer };
      try {
        window.CollectJS.startPaymentRequest();
      } catch (err) {
        clearTimeout(timer);
        pendingTokenRequest.current = null;
        reject(err);
      }
    });
  }, [ready, loadError, validation]);

  useImperativeHandle(ref, () => ({
    isReady: () => ready && !loadError,
    isValid: () => ready && validation.ccnumber && validation.ccexp && validation.cvv,
    getMaskedMetadata: () => ({ ...lastMetadata.current }),
    clear: () => window.CollectJS?.clearInputs?.(),
    tokenize,
    secureBooking: async ({
      bookingId,
      bookingCode,
      customerEmail,
      customerName,
      customerPhone,
      idempotencyKey,
      cardholderName,
      billingAddress,
    }) => {
      const tokenized = await tokenize();
      if (!tokenized.token) throw new Error('NMI did not return a payment token. Please try again.');
      const attached = await jsonRequest('/secure-payments/nmi-vault/attach', {
        method: 'POST',
        body: JSON.stringify({
          bookingId,
          bookingCode,
          customerEmail,
          customerName,
          customerPhone,
          idempotencyKey,
          cardholderName,
          billingAddress,
          paymentToken: tokenized.token,
          cardBrand: tokenized.cardBrand,
          last4: tokenized.last4,
          expMonth: tokenized.expMonth,
          expYear: tokenized.expYear,
        }),
      });
      return { ...attached, ...tokenized, token: undefined };
    },
  }), [ready, loadError, validation, tokenize]);

  return (
    <div className="nmi-card-fields" aria-busy={!ready}>
      <div className="booking-form-field nmi-card-number-field">
        <label>Card Number <span className="required-mark">*</span></label>
        <div id="faretransit-nmi-ccnumber" className="nmi-hosted-field" />
      </div>
      <div className="nmi-card-fields__row">
        <div className="booking-form-field">
          <label>Expiration <span className="required-mark">*</span></label>
          <div id="faretransit-nmi-ccexp" className="nmi-hosted-field" />
        </div>
        <div className="booking-form-field">
          <label>Security Code <span className="required-mark">*</span></label>
          <div id="faretransit-nmi-cvv" className="nmi-hosted-field" />
        </div>
      </div>
      {!ready && !loadError && <p className="nmi-field-status">Loading encrypted card fields…</p>}
      {loadError && <p className="nmi-field-error" role="alert">{loadError}</p>}
      <p className="nmi-field-note">
        Card details are entered directly into NMI-hosted fields. FareTransit never receives or stores the full card number or security code.
      </p>
    </div>
  );
});

export default ManualPaymentCardFields;
