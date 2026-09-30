import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate, useParams } from 'react-router-dom';
import enterpriseRentalApi from '../enterpriseRentalApi';
import NmiCardFields from '../components/NmiCardFields';
import './CarRentalCheckoutPage.css';

const emptyCustomer = { firstName: '', lastName: '', email: '', phone: '', age: 25 };
const emptyBilling = { address1: '', address2: '', city: '', state: '', postal: '', country: 'US' };

function money(amount, currency = 'USD') {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount || 0)); }
  catch { return `$${Number(amount || 0).toFixed(2)}`; }
}

export default function CarRentalCheckoutPage() {
  const { quoteToken } = useParams();
  const navigate = useNavigate();
  const [quote, setQuote] = useState(null);
  const [paymentConfig, setPaymentConfig] = useState(null);
  const [customer, setCustomer] = useState(emptyCustomer);
  const [billing, setBilling] = useState(emptyBilling);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    Promise.all([enterpriseRentalApi.getQuote(quoteToken), enterpriseRentalApi.getPaymentConfig()])
      .then(([quoteData, configData]) => {
        if (!live) return;
        setQuote(quoteData);
        setPaymentConfig(configData);
        setCustomer((current) => ({ ...current, age: Number(quoteData?.search?.renter_age || 25) }));
      })
      .catch((err) => live && setError(err.message || 'Unable to load this rental quote.'))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [quoteToken]);

  const formValid = useMemo(() => {
    return Boolean(
      customer.firstName.trim() && customer.lastName.trim() && /^\S+@\S+\.\S+$/.test(customer.email) &&
      customer.phone.replace(/\D/g, '').length >= 7 && Number(customer.age) >= 18 && Number(customer.age) <= 99 &&
      billing.address1.trim() && billing.city.trim() && billing.state.trim() && billing.postal.trim() && termsAccepted
    );
  }, [customer, billing, termsAccepted]);

  const ensureOrder = async () => {
    if (order) return order;
    const created = await enterpriseRentalApi.createOrder({ quoteToken, customer, billing });
    setOrder(created);
    return created;
  };

  const handlePaymentToken = async (paymentToken) => {
    if (!formValid || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const currentOrder = await ensureOrder();
      const authorized = await enterpriseRentalApi.authorizeOrder(currentOrder.publicToken, paymentToken);
      navigate(`/car-rentals/confirmation/${encodeURIComponent(currentOrder.publicToken)}`, { replace: true, state: { authorized } });
    } catch (err) {
      setError(err.message || 'We could not authorize the card. Please review the details and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="rental-checkout-page"><div className="rental-checkout-loading"><i className="fas fa-spinner fa-spin" /><h2>Preparing secure checkout...</h2></div></div>;

  if (error && !quote) return (
    <div className="rental-checkout-page"><div className="rental-checkout-error"><h2>Checkout unavailable</h2><p>{error}</p><Link to="/car-rentals">Start a new rental search</Link></div></div>
  );

  const vehicle = quote?.vehicle || {};
  const search = quote?.search || {};
  const pickup = quote?.pickupLocation;
  const dropoff = quote?.returnLocation;

  return (
    <div className="rental-checkout-page">
      <Helmet><title>Secure Car Rental Checkout | FareTransit</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <div className="container rental-checkout-shell">
        <div className="rental-checkout-main">
          <div className="rental-checkout-heading"><span className="rental-step-pill">Secure checkout</span><h1>Review your rental request</h1><p>We will authorize your card while our reservation team confirms the rental. The authorization is captured only after the supplier reservation is confirmed.</p></div>

          {error && <div className="rental-form-error" role="alert"><i className="fas fa-exclamation-circle" /> {error}</div>}

          <section className="rental-checkout-card">
            <h2><i className="fas fa-user" /> Driver & contact details</h2>
            <div className="rental-form-grid">
              <label>First name<input value={customer.firstName} onChange={(e) => setCustomer({ ...customer, firstName: e.target.value })} autoComplete="given-name" /></label>
              <label>Last name<input value={customer.lastName} onChange={(e) => setCustomer({ ...customer, lastName: e.target.value })} autoComplete="family-name" /></label>
              <label>Email<input type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} autoComplete="email" /></label>
              <label>Phone<input type="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} autoComplete="tel" /></label>
              <label>Driver age<input type="number" min="18" max="99" value={customer.age} onChange={(e) => setCustomer({ ...customer, age: e.target.value })} /></label>
            </div>
          </section>

          <section className="rental-checkout-card">
            <h2><i className="fas fa-map-marker-alt" /> Billing address</h2>
            <div className="rental-form-grid">
              <label className="rental-field-wide">Street address<input value={billing.address1} onChange={(e) => setBilling({ ...billing, address1: e.target.value })} autoComplete="address-line1" /></label>
              <label className="rental-field-wide">Apartment / suite (optional)<input value={billing.address2} onChange={(e) => setBilling({ ...billing, address2: e.target.value })} autoComplete="address-line2" /></label>
              <label>City<input value={billing.city} onChange={(e) => setBilling({ ...billing, city: e.target.value })} autoComplete="address-level2" /></label>
              <label>State<input value={billing.state} onChange={(e) => setBilling({ ...billing, state: e.target.value })} autoComplete="address-level1" /></label>
              <label>ZIP code<input value={billing.postal} onChange={(e) => setBilling({ ...billing, postal: e.target.value })} autoComplete="postal-code" /></label>
              <label>Country<input value="United States" disabled /></label>
            </div>
          </section>

          <section className="rental-checkout-card">
            <h2><i className="fas fa-credit-card" /> Payment authorization</h2>
            <p className="rental-payment-copy">Your card is authorized for <strong>{money(quote.total, quote.currency)}</strong>. FareTransit will manually confirm the supplier reservation before capture.</p>
            <label className="rental-terms-check"><input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} /><span>I agree to the <Link to="/terms" target="_blank">Terms & Conditions</Link> and understand that FareTransit is an independent reservation assistance service and the vehicle make/model may be substituted within the selected class.</span></label>
            {!formValid && <p className="rental-form-hint">Complete the required driver, billing, and terms fields to enable secure card authorization.</p>}
            <NmiCardFields
              tokenizationKey={paymentConfig?.configured ? paymentConfig.publicTokenizationKey : null}
              disabled={!formValid || submitting}
              onToken={handlePaymentToken}
              onError={(err) => setError(err.message || 'Secure payment fields returned an error.')}
            />
            {!paymentConfig?.configured && <p className="rental-form-hint">NMI credentials are not enabled in this deployment yet. Checkout will become active automatically after the tokenization and private API keys are added.</p>}
          </section>
        </div>

        <aside className="rental-summary-card">
          {vehicle.imageUrl && <img src={vehicle.imageUrl} alt={vehicle.name || 'Rental vehicle'} />}
          <span className="rental-summary-brand">Enterprise rental class</span>
          <h2>{vehicle.name || 'Rental vehicle'}</h2>
          <p>{vehicle.makeModel ? `${vehicle.makeModel} or similar` : 'Vehicle or similar within selected class'}</p>
          <div className="rental-summary-line"><span>Pickup</span><strong>{pickup?.name || search.location_id}</strong><small>{search.pickup_date} at {search.pickup_time}</small></div>
          <div className="rental-summary-line"><span>Return</span><strong>{dropoff?.name || search.return_location_id || search.location_id}</strong><small>{search.return_date} at {search.return_time}</small></div>
          <div className="rental-summary-price"><span>Total</span><strong>{money(quote.total, quote.currency)}</strong></div>
          <p className="rental-summary-disclosure">FareTransit independently assists with the reservation and is not affiliated with Enterprise Rent-A-Car.</p>
        </aside>
      </div>
    </div>
  );
}
