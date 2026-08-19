import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { consultingServices, PAYMENT_DISCLAIMER } from '../../../shared/data/consultingServices';
import { paymentAPI } from '../../../shared/api/api';
import journeySessionAPI from '../../../shared/api/journeySessionApi';
import { normalizeError } from '../../../shared/utils/normalizeError';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF } from '../../../shared/constants/supportContact';
import './ConsultingPaymentPage.css';

const initialBilling = {
  fullName: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  country: 'United States',
  agreeTerms: false,
};

function ConsultingPayment({ paymentToken = null, initialSession = null }) {
  const initialPayload = initialSession || {};
  const [selectedId, setSelectedId] = useState(initialPayload.serviceId || 'urgent');
  const [billing, setBilling] = useState({ ...initialBilling, ...(initialPayload.billing || {}) });
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  const selected = consultingServices.find((service) => service.id === selectedId) || consultingServices[0];
  const finalPrice = Number(selected.price).toFixed(2);

  useEffect(() => {
    if (!paymentToken) return undefined;
    const timer = window.setTimeout(() => {
      journeySessionAPI.updatePayment(paymentToken, {
        payload: {
          serviceId: selectedId,
          billing: {
            fullName: billing.fullName,
            email: billing.email,
            phone: billing.phone,
            address: billing.address,
            city: billing.city,
            state: billing.state,
            zip: billing.zip,
            country: billing.country,
            agreeTerms: !!billing.agreeTerms,
          },
        },
      }).catch(() => {/* non-blocking durable payment-form save */});
    }, 900);
    return () => window.clearTimeout(timer);
  }, [paymentToken, selectedId, billing]);

  const handleChange = (field, value) => {
    setBilling((previous) => ({ ...previous, [field]: value }));
    if (status === 'error') setMessage('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (status === 'submitting') return;

    if (!billing.agreeTerms) {
      setMessage('You must agree to the terms and policies to proceed.');
      setStatus('error');
      return;
    }

    setStatus('submitting');
    setMessage('');

    // Browser storage is only a convenience cache. The p_ URL + server session is
    // the durable source of truth. Raw card credentials are still entered only on
    // the hosted provider page and are never stored here.
    sessionStorage.setItem('pendingBilling', JSON.stringify({
      fullName: billing.fullName,
      email: billing.email,
      phone: billing.phone,
      address: billing.address,
      city: billing.city,
      state: billing.state,
      zip: billing.zip,
      country: billing.country,
      serviceId: selected.id,
      paymentToken,
    }));

    try {
      const response = await paymentAPI.createStripeSession({
        type: 'consulting',
        email: billing.email.trim(),
        amount: Number(finalPrice),
        name: billing.fullName.trim(),
        phone: billing.phone.trim(),
        origin: billing.city.trim(),
        destination: billing.state.trim(),
        notes: [
          `Consulting plan: ${selected.name} ($${selected.price})`,
          `Billing address: ${billing.address}, ${billing.city}, ${billing.state} ${billing.zip}, ${billing.country}`
        ].join(' | '),
        planName: selected.name,
        planDescription: selected.description,
        journeySessionToken: paymentToken,
      });

      if (response?.success === true && response?.url) {
        let checkoutUrl;
        try {
          checkoutUrl = new URL(response.url);
        } catch {
          throw new Error('The payment provider returned an invalid checkout URL.');
        }

        if (checkoutUrl.protocol !== 'https:') {
          throw new Error('The secure checkout URL was not valid.');
        }

        if (paymentToken) {
          journeySessionAPI.updatePayment(paymentToken, {
            payload: {
              serviceId: selectedId,
              billing: {
                fullName: billing.fullName,
                email: billing.email,
                phone: billing.phone,
                address: billing.address,
                city: billing.city,
                state: billing.state,
                zip: billing.zip,
                country: billing.country,
                agreeTerms: !!billing.agreeTerms,
              },
              provider: 'stripe',
              providerStatus: 'REDIRECTED',
            },
          }).catch(() => {/* redirect must not depend on session bookkeeping */});
        }

        window.location.assign(checkoutUrl.href);
        return;
      }

      throw new Error(response?.error?.message || response?.message || 'Secure checkout could not be created.');
    } catch (error) {
      setStatus('error');
      setMessage(normalizeError(error, `Unable to initiate secure checkout right now. Call ${SUPPORT_PHONE_DISPLAY} or email support@faretransit.com.`));
    }
  };

  return (
    <div className="consulting-payment-page">
      <Helmet>
        <title>Secure Payment | Travel Assistance | FareTransit</title>
        <meta name="description" content="Pay travel-assistance and consulting service fees through FareTransit's secure hosted checkout." />
      </Helmet>

      <div className="consulting-payment-container">
        <header className="consulting-payment-header">
          <h1>Secure Payment</h1>
          <p>Select your service and continue to the secure hosted checkout. Card details are entered directly on the payment provider's page and are not collected on FareTransit website.</p>
        </header>

        <div className="consulting-payment-layout">
          <section className="consulting-payment-services" aria-labelledby="service-plans-heading">
            <h2 id="service-plans-heading">Service Plans</h2>
            <p className="consulting-payment-services__intro">Select the service tier that matches your travel needs. Prices are in USD and cover assistance services.</p>
            <div className="consulting-payment-plans">
              {consultingServices.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  className={`consulting-payment-plan ${selectedId === plan.id ? 'consulting-payment-plan--active' : ''}`}
                  onClick={() => setSelectedId(plan.id)}
                  aria-pressed={selectedId === plan.id}
                  disabled={status === 'submitting'}
                >
                  {plan.recommended && <span className="consulting-payment-plan__badge">Popular</span>}
                  <h3>{plan.name}</h3>
                  <p className="consulting-payment-plan__price"><span>${plan.price}</span><small>USD · one-time fee</small></p>
                  <p className="consulting-payment-plan__desc">{plan.description}</p>
                  <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
                </button>
              ))}
            </div>
          </section>

          <section className="consulting-payment-checkout" aria-labelledby="checkout-heading">
            <h2 id="checkout-heading">Contact & Billing Details</h2>
            <form className="consulting-payment-form" onSubmit={handleSubmit}>
              <fieldset className="consulting-payment-fieldset">
                <legend>Billing Contact</legend>
                <div className="consulting-payment-row">
                  <label>Full name<input type="text" value={billing.fullName} onChange={(event) => handleChange('fullName', event.target.value)} required autoComplete="name" placeholder="e.g. Jane Doe" /></label>
                  <label>Email<input type="email" value={billing.email} onChange={(event) => handleChange('email', event.target.value)} required autoComplete="email" placeholder="e.g. jane@example.com" /></label>
                </div>
                <label>Phone<input type="tel" value={billing.phone} onChange={(event) => handleChange('phone', event.target.value)} required autoComplete="tel" placeholder="e.g. +1 (555) 000-0000" /></label>
                <label>Street address<input type="text" value={billing.address} onChange={(event) => handleChange('address', event.target.value)} required autoComplete="street-address" placeholder="e.g. 123 Main St" /></label>
                <div className="consulting-payment-row consulting-payment-row--3">
                  <label>City<input type="text" value={billing.city} onChange={(event) => handleChange('city', event.target.value)} required autoComplete="address-level2" placeholder="City" /></label>
                  <label>State<input type="text" value={billing.state} onChange={(event) => handleChange('state', event.target.value)} required autoComplete="address-level1" placeholder="State" /></label>
                  <label>ZIP<input type="text" value={billing.zip} onChange={(event) => handleChange('zip', event.target.value)} required autoComplete="postal-code" placeholder="ZIP" /></label>
                </div>
                <label>Country<input type="text" value={billing.country} onChange={(event) => handleChange('country', event.target.value)} required autoComplete="country-name" /></label>
              </fieldset>

              <div className="stripe-secure-payment-notice" style={{ marginBottom: '1.25rem' }}>
                <div className="stripe-notice-header">
                  <span className="secure-badge"><i className="fas fa-lock" aria-hidden="true" /> Secure Hosted Checkout</span>
                  <div className="card-brand-logos">
                    <i className="fab fa-cc-visa" title="Visa" />
                    <i className="fab fa-cc-mastercard" title="Mastercard" />
                    <i className="fab fa-cc-amex" title="American Express" />
                    <i className="fab fa-cc-discover" title="Discover" />
                  </div>
                </div>
                <p style={{ margin: '0.75rem 0 0', color: '#475569', lineHeight: 1.5 }}>
                  Your card number and security code are entered only after you continue to the secure payment provider. FareTransit does not collect those values on this form.
                </p>
              </div>

              <div className="consulting-payment-order-summary">
                <div className="consulting-payment-order-summary__total"><span>Total due today</span><strong>${finalPrice} USD</strong></div>
              </div>

              <label className="consulting-payment-terms">
                <input type="checkbox" checked={billing.agreeTerms} onChange={(event) => handleChange('agreeTerms', event.target.checked)} required />
                <span>
                  I agree to the <Link to="/terms" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions</Link>,{' '}
                  <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</Link>, and{' '}
                  <Link to="/refund-policy" target="_blank" rel="noopener noreferrer">Refund Policy</Link>. I understand this fee is for consulting services only.
                </span>
              </label>

              {message && <p className={`consulting-payment-message consulting-payment-message--${status}`} role="alert">{message}</p>}

              <button type="submit" className="consulting-payment-submit" disabled={status === 'submitting'}>
                {status === 'submitting' ? <><i className="fas fa-spinner fa-spin" /> Creating Secure Checkout…</> : `Continue to Secure Checkout — $${finalPrice}`}
              </button>

              <p className="consulting-payment-help">Questions before paying? <a href={SUPPORT_PHONE_HREF}>Call {SUPPORT_PHONE_DISPLAY}</a> or <a href="mailto:support@faretransit.com">support@faretransit.com</a></p>
            </form>
          </section>
        </div>

        <aside className="consulting-payment-disclaimer" data-nosnippet="true"><small>{PAYMENT_DISCLAIMER}</small></aside>
        <div className="consulting-payment-business"><p><strong>FareTransit LLC</strong> · 1309 Coffeen Avenue STE 1200, Sheridan, WY 82801 · {SUPPORT_PHONE_DISPLAY} · support@faretransit.com</p></div>
      </div>
    </div>
  );
}

export default ConsultingPayment;
