import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { consultingServices, PAYMENT_DISCLAIMER } from '../../../shared/data/consultingServices';
import { paymentAPI } from '../../../shared/api/api';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_HREF, BUSINESS_ADDRESS_SHORT } from '../../../shared/constants/supportContact';
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

function ConsultingPayment() {
  const [selectedId, setSelectedId] = useState('urgent');
  const [billing, setBilling] = useState(initialBilling);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  const [couponInput, setCouponInput] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponMessage, setCouponMessage] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState('');

  const selected = consultingServices.find((s) => s.id === selectedId) || consultingServices[1];

  const applyCoupon = () => {
    if (couponInput.trim().toLowerCase() === 'welcome') {
      setCouponApplied(true);
      setAppliedCoupon('WELCOME');
      setCouponMessage('Coupon code applied successfully! 99% off your plan.');
    } else {
      setCouponMessage('Invalid coupon code.');
      setCouponApplied(false);
    }
  };

  const getPlanPrice = () => {
    const originalPrice = selected.price;
    const discount = couponApplied ? originalPrice * 0.99 : 0;
    const finalPrice = originalPrice - discount;
    return {
      original: originalPrice.toFixed(2),
      discount: discount.toFixed(2),
      final: finalPrice.toFixed(2),
    };
  };

  const planPrice = getPlanPrice();

  const handleChange = (field, value) => {
    setBilling((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!billing.agreeTerms) {
      setMessage('You must agree to the terms and policies to proceed.');
      setStatus('error');
      return;
    }

    setStatus('submitting');
    setMessage('');

    // Save pending billing in sessionStorage to restore details if needed
    sessionStorage.setItem('pendingBilling', JSON.stringify(billing));

    try {
      const response = await paymentAPI.createStripeSession({
        type: 'consulting',
        email: billing.email,
        amount: parseFloat(planPrice.final),
        name: billing.fullName,
        phone: billing.phone,
        origin: billing.city,
        destination: billing.state,
        notes: [
          `Consulting plan: ${selected.name} ($${selected.price})`,
          `Billing address: ${billing.address}, ${billing.city}, ${billing.state} ${billing.zip}, ${billing.country}`
        ].join(' | '),
        planName: selected.name,
        planDescription: selected.description,
      });

      if (response.success && response.url) {
        // Redirect to secure Stripe hosted checkout
        window.location.href = response.url;
      } else {
        throw new Error('Did not receive secure checkout URL from the server');
      }
    } catch (error) {
      console.error('Stripe session creation failed:', error);
      setStatus('error');
      setMessage(
        error.response?.data?.error ||
          `Unable to initiate checkout right now. Call ${SUPPORT_PHONE_DISPLAY} or email support@faretransit.com.`
      );
    }
  };

  return (
    <div className="consulting-payment-page">
      <Helmet>
        <title>Secure Payment | Consulting Service Fees | FareTransit LLC</title>
        <meta
          name="description"
          content="Pay consulting and logistics advisory service fees securely. FareTransit LLC provides itinerary support, routing assistance, and urgent travel coordination."
        />
        <link rel="canonical" href="https://faretransit.com/payment" />
      </Helmet>

      <div className="consulting-payment-container">
        <header className="consulting-payment-header">
          <h1>Secure Consulting Payment</h1>
          <p>
            Pay for logistics advisory, itinerary coordination, and urgent travel support. All
            transactions are encrypted and processed through PCI-compliant payment infrastructure.
          </p>
        </header>

        <div className="consulting-payment-layout">
          <section className="consulting-payment-services" aria-labelledby="service-plans-heading">
            <h2 id="service-plans-heading">Service Plans</h2>
            <p className="consulting-payment-services__intro">
              Select the advisory tier that matches your travel needs. Prices are in USD and cover
              consultancy services only.
            </p>
            <div className="consulting-payment-plans">
              {consultingServices.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  className={`consulting-payment-plan ${selectedId === plan.id ? 'consulting-payment-plan--active' : ''}`}
                  onClick={() => setSelectedId(plan.id)}
                  aria-pressed={selectedId === plan.id}
                >
                  {plan.recommended && <span className="consulting-payment-plan__badge">Popular</span>}
                  <h3>{plan.name}</h3>
                  <p className="consulting-payment-plan__price">
                    <span>${plan.price}</span>
                    <small>USD · one-time fee</small>
                  </p>
                  <p className="consulting-payment-plan__desc">{plan.description}</p>
                  <ul>
                    {plan.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </section>

          <section className="consulting-payment-checkout" aria-labelledby="checkout-heading">
            <h2 id="checkout-heading">Checkout & Billing</h2>
            <form className="consulting-payment-form" onSubmit={handleSubmit}>
              <fieldset className="consulting-payment-fieldset">
                <legend>Billing Contact</legend>
                <div className="consulting-payment-row">
                  <label>
                    Full name
                    <input
                      type="text"
                      value={billing.fullName}
                      onChange={(e) => handleChange('fullName', e.target.value)}
                      required
                      autoComplete="name"
                      placeholder="e.g. Jane Doe"
                    />
                  </label>
                  <label>
                    Email
                    <input
                      type="email"
                      value={billing.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      required
                      autoComplete="email"
                      placeholder="e.g. jane@example.com"
                    />
                  </label>
                </div>
                <label>
                  Phone
                  <input
                    type="tel"
                    value={billing.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    required
                    autoComplete="tel"
                    placeholder="e.g. +1 (555) 000-0000"
                  />
                </label>
                <label>
                  Street address
                  <input
                    type="text"
                    value={billing.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    required
                    autoComplete="street-address"
                    placeholder="e.g. 123 Main St"
                  />
                </label>
                <div className="consulting-payment-row consulting-payment-row--3">
                  <label>
                    City
                    <input
                      type="text"
                      value={billing.city}
                      onChange={(e) => handleChange('city', e.target.value)}
                      required
                      autoComplete="address-level2"
                      placeholder="City"
                    />
                  </label>
                  <label>
                    State
                    <input
                      type="text"
                      value={billing.state}
                      onChange={(e) => handleChange('state', e.target.value)}
                      required
                      autoComplete="address-level1"
                      placeholder="State"
                    />
                  </label>
                  <label>
                    ZIP
                    <input
                      type="text"
                      value={billing.zip}
                      onChange={(e) => handleChange('zip', e.target.value)}
                      required
                      autoComplete="postal-code"
                      placeholder="ZIP"
                    />
                  </label>
                </div>
                <label>
                  Country
                  <input
                    type="text"
                    value={billing.country}
                    onChange={(e) => handleChange('country', e.target.value)}
                    required
                    autoComplete="country-name"
                  />
                </label>
              </fieldset>

              <fieldset className="consulting-payment-fieldset">
                <legend>
                  Secure Payment Method
                </legend>
                <div className="stripe-secure-payment-notice">
                  <div className="stripe-notice-header">
                    <span className="secure-badge">
                      <i className="fas fa-lock" aria-hidden="true" /> SSL Encrypted
                    </span>
                    <div className="card-brand-logos">
                      <i className="fab fa-cc-visa" title="Visa" />
                      <i className="fab fa-cc-mastercard" title="Mastercard" />
                      <i className="fab fa-cc-amex" title="American Express" />
                      <i className="fab fa-cc-discover" title="Discover" />
                    </div>
                  </div>
                  <p>
                    Payments are processed securely via <strong>Stripe Checkout</strong>. We do not collect or 
                    store your card information on our servers. Your connection is fully encrypted.
                  </p>
                </div>
              </fieldset>

              <fieldset className="consulting-payment-fieldset">
                <legend>Promo Code</legend>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value)}
                    placeholder="e.g. WELCOME"
                    disabled={couponApplied}
                    style={{ flex: 1, minHeight: '38px', padding: '0.25rem 0.75rem', fontSize: '0.88rem', border: '1px solid #cbd5e1', borderRadius: '6px', textTransform: 'uppercase', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={applyCoupon}
                    disabled={couponApplied}
                    style={{ background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '6px', padding: '0 1.25rem', fontSize: '0.88rem', fontWeight: '700', cursor: 'pointer', opacity: couponApplied ? 0.6 : 1 }}
                  >
                    Apply
                  </button>
                </div>
                {couponMessage && (
                  <span style={{ display: 'block', fontSize: '0.78rem', marginTop: '0.35rem', fontWeight: '600', color: couponApplied ? '#059669' : '#ef4444' }}>
                    {couponMessage}
                  </span>
                )}
              </fieldset>

              <div className="consulting-payment-order-summary">
                <div>
                  <span>{selected.name}</span>
                  <strong>${planPrice.original}</strong>
                </div>
                {couponApplied && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669', fontWeight: 'bold', fontSize: '0.92rem', marginBottom: '0.5rem' }}>
                    <span>Promo ({appliedCoupon}) - 99% Off</span>
                    <span>-${planPrice.discount}</span>
                  </div>
                )}
                <div className="consulting-payment-order-summary__total">
                  <span>Total due today</span>
                  <strong>${planPrice.final} USD</strong>
                </div>
              </div>

              <label className="consulting-payment-terms">
                <input
                  type="checkbox"
                  checked={billing.agreeTerms}
                  onChange={(e) => handleChange('agreeTerms', e.target.checked)}
                  required
                />
                <span>
                  I agree to the{' '}
                  <Link to="/terms" target="_blank" rel="noopener noreferrer">
                    Terms & Conditions
                  </Link>
                  ,{' '}
                  <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer">
                    Privacy Policy
                  </Link>
                  , and{' '}
                  <Link to="/refund-policy" target="_blank" rel="noopener noreferrer">
                    Refund Policy
                  </Link>
                  . I understand this fee is for consulting services only.
                </span>
              </label>

              {message && (
                <p
                  className={`consulting-payment-message consulting-payment-message--${status}`}
                  role="alert"
                >
                  {message}
                </p>
              )}

              <button
                type="submit"
                className="consulting-payment-submit"
                disabled={status === 'submitting'}
              >
                {status === 'submitting' ? (
                  <>
                    <i className="fas fa-spinner fa-spin" /> Redirecting to Stripe…
                  </>
                ) : (
                  `Pay $${selected.price.toFixed(2)} — Proceed to Secure Stripe Checkout`
                )}
              </button>

              <p className="consulting-payment-help">
                Questions before paying?{' '}
                <a href={SUPPORT_PHONE_HREF}>Call {SUPPORT_PHONE_DISPLAY}</a> or{' '}
                <a href="mailto:support@faretransit.com">support@faretransit.com</a>
              </p>
            </form>
          </section>
        </div>

        <aside className="consulting-payment-disclaimer" data-nosnippet="true">
          <small>{PAYMENT_DISCLAIMER}</small>
        </aside>

        <div className="consulting-payment-business">
          <p>
            <strong>FareTransit LLC</strong> · {BUSINESS_ADDRESS_SHORT} ·{' '}
            {SUPPORT_PHONE_DISPLAY} · support@faretransit.com
          </p>
        </div>
      </div>
    </div>
  );
}

export default ConsultingPayment;
