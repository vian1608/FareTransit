import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import addonAPI from './addonApi';
import './BaggagePaymentPage.css';

const passengerName = (request) => [request?.traveller?.first_name, request?.traveller?.middle_name, request?.traveller?.last_name].filter(Boolean).join(' ') || 'Passenger';
const expiryText = (value) => value ? new Date(value).toLocaleString() : 'Subject to availability';

function loadPayPalScript(environment) {
  const id = 'paypal-web-sdk-v6';
  if (window.paypal?.createInstance) return Promise.resolve();
  const existing = document.getElementById(id);
  if (existing) return new Promise((resolve, reject) => { existing.addEventListener('load', resolve, { once: true }); existing.addEventListener('error', reject, { once: true }); });
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = environment === 'live' ? 'https://www.paypal.com/web-sdk/v6/core' : 'https://www.sandbox.paypal.com/web-sdk/v6/core';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('PayPal checkout could not be loaded.'));
    document.head.appendChild(script);
  });
}

export default function BaggagePaymentPage() {
  const { token } = useParams();
  const [offer, setOffer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [providerReady, setProviderReady] = useState(false);
  const hostRef = useRef(null);

  const request = offer?.request;
  const status = String(request?.status || '').toUpperCase();
  const paid = ['PAID','PURCHASE_PENDING','CONFIRMED'].includes(status) || String(offer?.status || '').toUpperCase() === 'ACCEPTED';
  const unavailable = offer?.expired || ['PRICE_EXPIRED','DECLINED_BY_CUSTOMER','UNAVAILABLE','CANCELLED'].includes(status);
  const price = `${offer?.currency || 'USD'} ${Number(offer?.customer_price || 0).toFixed(2)}`;

  const refresh = async () => {
    const response = await addonAPI.getOffer(token);
    setOffer(response?.data || null);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try { const response = await addonAPI.getOffer(token); if (active) setOffer(response?.data || null); }
      catch (e) { if (active) setError(e.message || 'Unable to load this baggage offer.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!offer || paid || unavailable || !hostRef.current) return undefined;
    let disposed = false;
    let button;
    let clickHandler;
    (async () => {
      try {
        const config = (await addonAPI.getPaymentConfig())?.data || {};
        if (!config.enabled || !config.clientId) return;
        await loadPayPalScript(config.environment);
        if (disposed || !window.paypal?.createInstance) return;
        const sdk = await window.paypal.createInstance({ clientId: config.clientId, components: ['paypal-payments'], pageType: 'checkout' });
        const methods = await sdk.findEligibleMethods({ currencyCode: offer.currency || 'USD' });
        if (!methods?.isEligible?.('paypal') || disposed) return;
        const session = sdk.createPayPalOneTimePaymentSession({
          onApprove: async ({ orderId }) => {
            setMessage('Payment approved. Confirming your baggage payment…');
            setError('');
            try { await addonAPI.capturePayPalOrder(token, orderId); setMessage('Payment received — baggage purchase is now in progress.'); await refresh(); }
            catch (e) { setMessage(''); setError(e.message || 'Payment capture could not be confirmed. Please contact support before paying again.'); }
          },
          onCancel: () => setMessage('Payment cancelled. Your baggage request is unchanged.'),
          onError: () => setError('PayPal could not complete the baggage payment. Please try again or contact support.')
        });
        hostRef.current.innerHTML = '';
        button = document.createElement('paypal-button');
        button.setAttribute('type', 'pay');
        button.setAttribute('size', 'large');
        hostRef.current.appendChild(button);
        clickHandler = async () => {
          try {
            setError('');
            const orderPromise = addonAPI.createPayPalOrder(token).then((response) => ({ orderId: response?.data?.orderId }));
            await session.start({ presentationMode: 'auto' }, orderPromise);
          } catch (e) { setError(e.message || 'Unable to start baggage payment.'); }
        };
        button.addEventListener('click', clickHandler);
        setProviderReady(true);
      } catch (e) { if (!disposed) setError(e.message || 'Online baggage payment could not be initialized.'); }
    })();
    return () => { disposed = true; if (button && clickHandler) button.removeEventListener('click', clickHandler); };
  }, [offer?.id, offer?.currency, paid, unavailable, token]);

  const decline = async () => {
    if (!window.confirm('Decline this baggage offer? No baggage payment will be taken.')) return;
    try { await addonAPI.declineOffer(token); setMessage('Baggage offer declined. No baggage payment is due.'); await refresh(); }
    catch (e) { setError(e.message || 'Unable to decline this baggage offer.'); }
  };

  return <main className="baggage-pay-page"><section className="baggage-pay-card">
    <div className="baggage-pay-brand">FareTransit</div><h1>Complete Baggage Payment</h1>
    {loading && <p>Loading your baggage offer…</p>}{error && <div className="baggage-pay-alert error">{error}</div>}{message && <div className="baggage-pay-alert">{message}</div>}
    {!loading && offer && request && <>
      <div className="baggage-pay-details"><div><span>Booking</span><strong>{request.booking?.confirmation_code || 'Reservation'}</strong></div><div><span>Passenger</span><strong>{passengerName(request)}</strong></div><div><span>Journey</span><strong>{request.journey_direction === 'RETURN' ? 'Return' : 'Outbound'}</strong></div><div><span>Checked baggage</span><strong>{request.quantity} bag{request.quantity === 1 ? '' : 's'} · up to {request.requested_weight_kg || 23} kg each</strong></div><div><span>Offer valid until</span><strong>{expiryText(offer.valid_until)}</strong></div></div>
      <div className="baggage-pay-total"><span>Total baggage fee</span><strong>{price}</strong></div>
      {paid ? <div className="baggage-pay-success"><strong>{status === 'CONFIRMED' ? 'Baggage confirmed' : 'Payment received'}</strong><span>{status === 'CONFIRMED' ? 'Your baggage is confirmed by the supplier.' : 'We are completing the baggage purchase. Payment received does not by itself mean the airline has confirmed the baggage yet.'}</span></div> : unavailable ? <div className="baggage-pay-alert error">This baggage offer is no longer payable. Contact support for a fresh quote.</div> : <><div className="baggage-pay-provider" ref={hostRef}/>{!providerReady && <p className="baggage-pay-muted">Online baggage payment is unavailable right now. Your airfare reservation is unaffected.</p>}<button className="baggage-pay-decline" type="button" onClick={decline}>I Don't Need This Baggage</button></>}
      <p className="baggage-pay-fineprint">Baggage is a separate ancillary purchase and is not part of your airfare payment. Baggage is purchased only after this separate payment and remains subject to airline/supplier confirmation.</p>
    </>}
  </section></main>;
}
