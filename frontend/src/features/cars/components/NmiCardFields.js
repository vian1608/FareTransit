import React, { useEffect, useRef, useState } from 'react';

const SCRIPT_ID = 'faretransit-nmi-collectjs';
const SCRIPT_URL = 'https://secure.nmi.com/token/Collect.js';

/**
 * NMI-hosted card fields. FareTransit never reads or stores PAN/CVV values.
 * Collect.js returns only a one-time payment token, which is sent to our server
 * for an authorization-only transaction.
 */
export default function NmiCardFields({ tokenizationKey, disabled = false, onToken, onError }) {
  const [ready, setReady] = useState(false);
  const [tokenizing, setTokenizing] = useState(false);
  const callbacksRef = useRef({ onToken, onError });
  callbacksRef.current = { onToken, onError };

  useEffect(() => {
    if (!tokenizationKey) return undefined;
    let cancelled = false;

    const configure = () => {
      if (cancelled || !window.CollectJS?.configure) return;
      try {
        window.CollectJS.configure({
          variant: 'inline',
          styleSniffer: true,
          fields: {
            ccnumber: { selector: '#ft-nmi-card-number', title: 'Card Number', placeholder: 'Card number' },
            ccexp: { selector: '#ft-nmi-card-expiry', title: 'Card Expiration', placeholder: 'MM / YY' },
            cvv: { selector: '#ft-nmi-card-cvv', title: 'CVV', placeholder: 'CVV' }
          },
          callback: (response) => {
            setTokenizing(false);
            const token = response?.token || response?.payment_token;
            if (!token) {
              callbacksRef.current.onError?.(new Error('NMI did not return a payment token. Please check the card details and try again.'));
              return;
            }
            callbacksRef.current.onToken?.(token);
          }
        });
        setReady(true);
      } catch (error) {
        callbacksRef.current.onError?.(error);
      }
    };

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      if (window.CollectJS) configure();
      else existing.addEventListener('load', configure, { once: true });
      return () => {
        cancelled = true;
        existing.removeEventListener('load', configure);
      };
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_URL;
    script.async = true;
    script.dataset.tokenizationKey = tokenizationKey;
    script.addEventListener('load', configure, { once: true });
    script.addEventListener('error', () => callbacksRef.current.onError?.(new Error('Unable to load the secure NMI payment fields.')), { once: true });
    document.head.appendChild(script);

    return () => {
      cancelled = true;
      script.removeEventListener('load', configure);
    };
  }, [tokenizationKey]);

  const tokenize = () => {
    if (disabled || tokenizing || !ready) return;
    if (!window.CollectJS?.startPaymentRequest) {
      onError?.(new Error('Secure payment fields are not ready. Please wait a moment and retry.'));
      return;
    }
    setTokenizing(true);
    try {
      window.CollectJS.startPaymentRequest();
    } catch (error) {
      setTokenizing(false);
      onError?.(error);
    }
  };

  if (!tokenizationKey) {
    return <div className="rental-payment-unavailable" role="status"><i className="fas fa-lock" /> Secure online card authorization is not configured yet. No card information is being collected.</div>;
  }

  return (
    <div className="rental-nmi-payment">
      <div className="rental-secure-note"><i className="fas fa-shield-alt" /> Card details are entered directly into NMI-hosted secure fields and are not stored by FareTransit.</div>
      <div className="rental-card-field"><label>Card number</label><div id="ft-nmi-card-number" className="rental-nmi-hosted-field" /></div>
      <div className="rental-card-row">
        <div className="rental-card-field"><label>Expiration</label><div id="ft-nmi-card-expiry" className="rental-nmi-hosted-field" /></div>
        <div className="rental-card-field"><label>CVV</label><div id="ft-nmi-card-cvv" className="rental-nmi-hosted-field" /></div>
      </div>
      <button type="button" className="rental-primary-btn" onClick={tokenize} disabled={disabled || tokenizing || !ready}>
        <i className="fas fa-lock" /> {tokenizing ? 'Securing Card...' : ready ? 'Authorize & Submit Rental Request' : 'Loading Secure Payment...'}
      </button>
    </div>
  );
}
