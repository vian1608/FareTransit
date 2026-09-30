import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useParams } from 'react-router-dom';
import enterpriseRentalApi from '../enterpriseRentalApi';
import './CarRentalCheckoutPage.css';

function money(amount, currency = 'USD') {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount || 0)); }
  catch { return `$${Number(amount || 0).toFixed(2)}`; }
}

const statusCopy = {
  payment_pending: ['Payment required', 'Your rental request is saved, but the card authorization has not completed.'],
  awaiting_manual_booking: ['Request received', 'Your card has been authorized. FareTransit is now confirming the supplier reservation.'],
  booking_failed: ['Reservation needs attention', 'The requested supplier reservation could not be confirmed. FareTransit support will handle the outstanding payment authorization as needed.'],
  confirmed: ['Reservation confirmed', 'Your supplier reservation is confirmed and the authorized payment has been captured.'],
  cancelled: ['Reservation cancelled', 'This rental request has been cancelled.']
};

export default function CarRentalConfirmationPage() {
  const { publicToken } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    const load = () => enterpriseRentalApi.getOrder(publicToken)
      .then((data) => live && setOrder(data))
      .catch((err) => live && setError(err.message || 'Unable to load this rental request.'))
      .finally(() => live && setLoading(false));
    load();
    const timer = window.setInterval(() => {
      if (live && order?.status !== 'confirmed' && order?.status !== 'cancelled') load();
    }, 30000);
    return () => { live = false; window.clearInterval(timer); };
  }, [publicToken, order?.status]);

  if (loading && !order) return <div className="rental-checkout-page"><div className="rental-checkout-loading"><i className="fas fa-spinner fa-spin" /><h2>Loading rental request...</h2></div></div>;
  if (error && !order) return <div className="rental-checkout-page"><div className="rental-checkout-error"><h2>Request unavailable</h2><p>{error}</p><Link to="/car-rentals">Start a new search</Link></div></div>;

  const [title, detail] = statusCopy[order?.status] || ['Rental request received', 'FareTransit is processing your request.'];
  const vehicle = order?.vehicle || {};
  const search = order?.search || {};

  return (
    <div className="rental-checkout-page">
      <Helmet><title>{title} | FareTransit</title><meta name="robots" content="noindex,nofollow" /></Helmet>
      <div className="rental-checkout-error" style={{ textAlign: 'left', maxWidth: 760 }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <i className={order?.status === 'confirmed' ? 'fas fa-check-circle' : 'fas fa-clock'} style={{ fontSize: 42, color: order?.status === 'confirmed' ? '#126b43' : '#b7791f' }} />
          <h1 style={{ marginBottom: 8 }}>{title}</h1>
          <p>{detail}</p>
        </div>
        <div className="rental-summary-line"><span>FareTransit reference</span><strong>{order?.orderReference}</strong></div>
        {order?.supplierConfirmation && <div className="rental-summary-line"><span>Enterprise confirmation</span><strong>{order.supplierConfirmation}</strong></div>}
        <div className="rental-summary-line"><span>Vehicle class</span><strong>{vehicle.name || vehicle.category || 'Rental vehicle'}{vehicle.makeModel ? ` — ${vehicle.makeModel} or similar` : ''}</strong></div>
        <div className="rental-summary-line"><span>Pickup</span><strong>{order?.pickupLocation?.name || search.location_id || 'Enterprise location'}</strong><small>{search.pickup_date} at {search.pickup_time}</small></div>
        <div className="rental-summary-line"><span>Return</span><strong>{order?.returnLocation?.name || search.return_location_id || search.location_id || 'Enterprise location'}</strong><small>{search.return_date} at {search.return_time}</small></div>
        <div className="rental-summary-price"><span>{order?.paymentStatus === 'captured' ? 'Total paid' : 'Authorized amount'}</span><strong>{money(order?.amount, order?.currency)}</strong></div>
        <p style={{ marginTop: 22, color: '#687386' }}>Need help? Call FareTransit at <a href="tel:+18887808855">+1 (888) 780-8855</a>.</p>
      </div>
    </div>
  );
}
