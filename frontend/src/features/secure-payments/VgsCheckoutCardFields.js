import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

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
    const error = new Error(body?.error?.message || `Request failed (HTTP ${response.status})`);
    error.status = response.status;
    error.code = body?.error?.code;
    throw error;
  }
  return body.data;
}

function loadScript(src, integrity) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (window.VGSCollect) return resolve();
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    if (integrity) {
      script.integrity = integrity;
      script.crossOrigin = 'anonymous';
    }
    script.onload = resolve;
    script.onerror = () => reject(new Error('The secure card-entry library could not be loaded.'));
    document.head.appendChild(script);
  });
}

function findAlias(node, fieldName) {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findAlias(item, fieldName);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  if ((node.name === fieldName || node.value === fieldName || node.field === fieldName) && typeof node.alias === 'string') return node.alias;
  if (node[fieldName]) {
    if (typeof node[fieldName] === 'string') return node[fieldName];
    if (typeof node[fieldName]?.alias === 'string') return node[fieldName].alias;
  }
  for (const value of Object.values(node)) {
    const found = findAlias(value, fieldName);
    if (found) return found;
  }
  return null;
}

const fieldCss = {
  'font-family': 'Inter, Arial, sans-serif',
  'font-size': '16px',
  color: '#172033',
  height: '48px',
  padding: '0 13px',
  border: '1px solid #cbd5e1',
  'border-radius': '8px',
  'box-sizing': 'border-box',
  width: '100%',
  background: '#fff',
  outline: 'none',
};

const fieldBoxStyle = {
  minHeight: '48px',
  width: '100%',
  borderRadius: '8px',
  overflow: 'hidden',
};

const VgsCheckoutCardFields = forwardRef(function VgsCheckoutCardFields({ onFocus }, ref) {
  const formRef = useRef(null);
  const stateRef = useRef({});
  const configRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [environment, setEnvironment] = useState('');
  const [effectiveCvvTtlHours, setEffectiveCvvTtlHours] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer = null;

    const initialize = async () => {
      try {
        const config = await jsonRequest('/secure-payments/checkout/config');
        if (cancelled) return;
        configRef.current = config;
        setEnvironment(config.environment || '');
        setEffectiveCvvTtlHours(config.effectiveCvvTtlHours || null);
        if (!config.configured || !config.collectEnabled) {
          throw new Error('Secure card collection is not available yet.');
        }

        await loadScript(config.collectScript, config.collectIntegrity);
        if (cancelled || !window.VGSCollect) return;

        const mount = () => {
          if (cancelled) return;
          if (!document.querySelector('#tfs-checkout-vgs-pan') || !document.querySelector('#tfs-checkout-vgs-exp') || !document.querySelector('#tfs-checkout-vgs-cvv')) {
            retryTimer = window.setTimeout(mount, 80);
            return;
          }

          const form = window.VGSCollect.create(config.vaultId, config.environment, state => {
            stateRef.current = state || {};
          });
          if (config.collectCname) form.useCname(config.collectCname);
          if (config.collectRouteId) form.setRouteId(config.collectRouteId);
          const common = { css: fieldCss };
          form.field('#tfs-checkout-vgs-pan', {
            ...common,
            type: 'card-number',
            name: 'card_number',
            placeholder: '0000 0000 0000 0000',
            showCardIcon: true,
            autoComplete: 'cc-number',
            validations: ['required', 'validCardNumber'],
            tokenization: { format: 'UUID', storage: 'PERSISTENT' },
          });
          form.field('#tfs-checkout-vgs-exp', {
            ...common,
            type: 'card-expiration-date',
            name: 'card_expiration',
            placeholder: 'MM / YY',
            autoComplete: 'cc-exp',
            validations: ['required', 'validCardExpirationDate'],
            tokenization: { format: 'UUID', storage: 'PERSISTENT' },
          });
          form.field('#tfs-checkout-vgs-cvv', {
            ...common,
            type: 'card-security-code',
            name: 'card_cvv',
            placeholder: '123',
            autoComplete: 'cc-csc',
            validations: ['required', 'validCardSecurityCode'],
            tokenization: { format: 'UUID', storage: 'VOLATILE' },
          });
          formRef.current = form;
          setReady(true);
        };

        mount();
      } catch (e) {
        if (!cancelled) setError(e.message || 'Secure card fields could not be initialized.');
      }
    };

    initialize();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      try { formRef.current?.unmount?.(); } catch { /* best effort */ }
    };
  }, []);

  const getMaskedMetadata = () => {
    const card = stateRef.current?.card_number || {};
    const rawLast4 = String(card.last4 || card.cardLast4 || '').replace(/\D/g, '');
    return {
      cardBrand: card.cardType || card.cardBrand || card.brand || null,
      last4: /^\d{4}$/.test(rawLast4) ? rawLast4 : null,
    };
  };

  const fieldsValid = () => {
    const state = stateRef.current || {};
    return ['card_number', 'card_expiration', 'card_cvv'].every(name => state?.[name]?.isValid === true);
  };

  const createAliases = accessToken => new Promise((resolve, reject) => {
    const form = formRef.current;
    if (!form) return reject(new Error('Secure card fields are not ready yet.'));
    form.createAliases({ access_token: `Bearer ${accessToken}` }, (status, response) => {
      if (Number(status) < 200 || Number(status) >= 300) {
        reject(new Error('The secure vault did not accept the card details. Please check the card fields and retry.'));
        return;
      }
      const panAlias = findAlias(response, 'card_number');
      const expirationAlias = findAlias(response, 'card_expiration');
      const cvvAlias = findAlias(response, 'card_cvv');
      if (!panAlias || !expirationAlias || !cvvAlias) {
        reject(new Error('The secure vault response was incomplete. Please retry.'));
        return;
      }
      resolve({ panAlias, expirationAlias, cvvAlias });
    }, () => reject(new Error('Please correct the highlighted secure card fields and try again.')));
  });

  useImperativeHandle(ref, () => ({
    isReady: () => ready && !!formRef.current,
    isValid: fieldsValid,
    getMaskedMetadata,
    secureBooking: async ({
      bookingId,
      bookingCode,
      customerEmail,
      customerName,
      customerPhone,
      authorizedAmount,
      currency = 'USD',
      purpose,
      idempotencyKey,
      cardholderName,
      billingAddress,
    }) => {
      if (!ready || !formRef.current) throw new Error(error || 'Secure card fields are still loading.');
      if (!fieldsValid()) throw new Error('Please enter a valid card number, expiration date, and security code.');

      const proof = { bookingId, bookingCode, customerEmail, idempotencyKey };
      const tokenConfig = await jsonRequest('/secure-payments/checkout/collect-token', {
        method: 'POST',
        body: JSON.stringify(proof),
      });
      const aliases = await createAliases(tokenConfig.accessToken);
      const masked = getMaskedMetadata();

      const attached = await jsonRequest('/secure-payments/checkout/attach', {
        method: 'POST',
        body: JSON.stringify({
          ...proof,
          ...aliases,
          customerName,
          customerPhone,
          authorizedAmount,
          currency,
          purpose,
          cardholderName,
          cardBrand: masked.cardBrand,
          last4: masked.last4,
          billingAddress,
        }),
      });
      return { ...attached, ...masked };
    },
  }), [ready, error]);

  return (
    <>
      <div className="booking-form-field" style={{ marginTop: '0.85rem' }} onClick={onFocus}>
        <label>Card Number <span style={{ color: '#dc2626' }}>*</span></label>
        <div id="tfs-checkout-vgs-pan" style={fieldBoxStyle} />
      </div>

      <div className="form-row-two">
        <div className="booking-form-field" onClick={onFocus}>
          <label>Expiration Date <span style={{ color: '#dc2626' }}>*</span></label>
          <div id="tfs-checkout-vgs-exp" style={fieldBoxStyle} />
        </div>
        <div className="booking-form-field" onClick={onFocus}>
          <label>
            Security Code (CVV / CCH) <span style={{ color: '#dc2626' }}>*</span>
            <span className="cch-tooltip" title="3 digits on most cards, or 4 digits on the front of AMEX">
              <i className="fas fa-question-circle"></i>
            </span>
          </label>
          <div id="tfs-checkout-vgs-cvv" style={fieldBoxStyle} />
        </div>
      </div>

      {!ready && !error && (
        <div style={{ marginTop: '0.8rem', color: '#64748b', fontSize: '0.86rem' }}>
          <i className="fas fa-circle-notch fa-spin" style={{ marginRight: '0.45rem' }}></i>
          Loading protected card fields…
        </div>
      )}
      {error && (
        <div className="payment-error-banner" role="alert" style={{ marginTop: '0.8rem', padding: '0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b' }}>
          <i className="fas fa-exclamation-circle" style={{ marginRight: '0.5rem' }}></i>
          {error}
        </div>
      )}
      {ready && environment === 'sandbox' && (
        <div style={{ marginTop: '0.8rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.7rem 0.8rem', fontSize: '0.82rem' }}>
          Sandbox vault active. CVV is volatile for up to {effectiveCvvTtlHours || 1} hour.
        </div>
      )}
    </>
  );
});

export default VgsCheckoutCardFields;
