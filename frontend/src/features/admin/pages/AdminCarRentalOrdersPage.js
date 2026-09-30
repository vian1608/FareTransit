import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import enterpriseRentalApi from '../../cars/enterpriseRentalApi';
import './AdminCarRentalOrdersPage.css';

function money(value, currency = 'USD') {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0)); }
  catch { return `$${Number(value || 0).toFixed(2)}`; }
}

export default function AdminCarRentalOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [drafts, setDrafts] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await enterpriseRentalApi.admin.listOrders(status);
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Unable to load Enterprise rental orders.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const setDraft = (reference, key, value) => setDrafts((current) => ({ ...current, [reference]: { ...(current[reference] || {}), [key]: value } }));

  const confirmAndCapture = async (order) => {
    const draft = drafts[order.orderReference] || {};
    if (!draft.supplierConfirmation?.trim() || draft.supplierCost === '' || draft.supplierCost === undefined) {
      setError('Enter the Enterprise confirmation number and supplier cost before capture.');
      return;
    }
    if (!window.confirm(`Capture ${money(order.amount, order.currency)} for ${order.orderReference} after confirming the Enterprise booking?`)) return;
    setBusy(order.orderReference);
    setError('');
    try {
      await enterpriseRentalApi.admin.confirmAndCapture(order.orderReference, draft);
      await load();
    } catch (err) {
      setError(err.message || 'Unable to confirm and capture this rental.');
    } finally {
      setBusy('');
    }
  };

  const markUnavailable = async (order) => {
    if (!window.confirm(`Mark ${order.orderReference} as unable to book?`)) return;
    setBusy(order.orderReference);
    setError('');
    try {
      const result = await enterpriseRentalApi.admin.markUnavailable(order.orderReference);
      if (result?.adminActionRequired === 'void_authorization_in_nmi') {
        window.alert('Order marked unavailable. The customer authorization still needs to be voided in NMI.');
      }
      await load();
    } catch (err) {
      setError(err.message || 'Unable to update this rental.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="car-admin-page">
      <header className="car-admin-header">
        <div><Link to="/admin/dashboard" className="car-admin-back">← Admin dashboard</Link><h1>Enterprise Rental Orders</h1><p>Authorize first, book manually on Enterprise, then enter the confirmation and supplier cost before capture.</p></div>
        <button type="button" onClick={load} disabled={loading}>↻ Refresh</button>
      </header>

      <div className="car-admin-toolbar">
        <label>Status <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="payment_pending">Payment pending</option><option value="awaiting_manual_booking">Awaiting manual booking</option><option value="booking_failed">Booking failed</option><option value="confirmed">Confirmed</option></select></label>
        <strong>{orders.length} order{orders.length === 1 ? '' : 's'}</strong>
      </div>

      {error && <div className="car-admin-error" role="alert">{error}</div>}
      {loading && <div className="car-admin-empty">Loading rental orders...</div>}
      {!loading && orders.length === 0 && <div className="car-admin-empty">No Enterprise rental orders match this filter.</div>}

      <div className="car-admin-orders">
        {orders.map((order) => {
          const draft = drafts[order.orderReference] || {};
          const vehicle = order.vehicle || {};
          const search = order.search || {};
          const needsBooking = order.status === 'awaiting_manual_booking';
          return (
            <article className="car-admin-order" key={order.orderReference}>
              <div className="car-admin-order-top">
                <div><span className={`car-admin-status car-admin-status--${order.status}`}>{order.status?.replaceAll('_', ' ')}</span><h2>{order.orderReference}</h2><p>{order.customer?.firstName} {order.customer?.lastName} · {order.customer?.email} · {order.customer?.phone}</p></div>
                <div className="car-admin-price"><small>Customer amount</small><strong>{money(order.amount, order.currency)}</strong><span>{order.paymentStatus?.replaceAll('_', ' ')}</span></div>
              </div>

              <div className="car-admin-details">
                <div><small>Vehicle</small><strong>{vehicle.name || vehicle.category}</strong><span>{vehicle.makeModel ? `${vehicle.makeModel} or similar` : vehicle.vehicleCode}</span></div>
                <div><small>Pickup</small><strong>{order.pickupLocation?.name || search.location_id}</strong><span>{search.pickup_date} {search.pickup_time}</span></div>
                <div><small>Return</small><strong>{order.returnLocation?.name || search.return_location_id || search.location_id}</strong><span>{search.return_date} {search.return_time}</span></div>
                <div><small>Enterprise confirmation</small><strong>{order.supplierConfirmation || 'Not entered'}</strong>{order.supplierCost !== null && order.supplierCost !== undefined && <span>Cost {money(order.supplierCost, order.currency)} · Margin {money(order.grossMargin, order.currency)}</span>}</div>
              </div>

              {order.adminActionRequired && <div className="car-admin-warning">Action required: {order.adminActionRequired.replaceAll('_', ' ')}</div>}

              {needsBooking && (
                <div className="car-admin-fulfill">
                  <label>Enterprise confirmation<input value={draft.supplierConfirmation || ''} onChange={(e) => setDraft(order.orderReference, 'supplierConfirmation', e.target.value)} placeholder="Confirmation number" /></label>
                  <label>Supplier cost (USD)<input type="number" min="0" step="0.01" value={draft.supplierCost ?? ''} onChange={(e) => setDraft(order.orderReference, 'supplierCost', e.target.value)} placeholder="0.00" /></label>
                  <button type="button" className="car-admin-capture" disabled={busy === order.orderReference} onClick={() => confirmAndCapture(order)}>{busy === order.orderReference ? 'Processing...' : 'Confirm Booking & Capture'}</button>
                  <button type="button" className="car-admin-fail" disabled={busy === order.orderReference} onClick={() => markUnavailable(order)}>Unable to Book</button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
