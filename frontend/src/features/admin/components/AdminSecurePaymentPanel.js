import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminAPI } from '../../../shared/api/api';
import { boGet, boPost } from '../../backoffice/backofficeApi';
import '../../backoffice/SecurePaymentAdmin.css';

function unwrapBooking(response) {
  const data = response?.data ?? response;
  return data?.booking || data;
}

function pickCustomer(booking) {
  const contact = booking?.contact || booking?.contacts?.[0] || {};
  const traveller = booking?.travellers?.[0] || booking?.travelers?.[0] || {};
  const first = traveller.first_name || traveller.firstName || contact.first_name || contact.firstName || '';
  const last = traveller.last_name || traveller.lastName || contact.last_name || contact.lastName || '';
  return {
    name: contact.name || contact.full_name || `${first} ${last}`.trim() || booking?.passenger_name || 'Traveler',
    email: contact.email || booking?.email || traveller.email || '',
    phone: contact.phone || contact.phone_number || booking?.phone || '',
  };
}

function maskedCard(method) {
  if (!method?.last4) return 'Not recorded';
  return `${String(method.cardBrand || 'Card').toUpperCase()} •••• ${method.last4}`;
}

function expiry(method) {
  return method?.expMonth && method?.expYear ? `${String(method.expMonth).padStart(2, '0')}/${method.expYear}` : '—';
}

export default function AdminSecurePaymentPanel() {
  const { code } = useParams();
  const [booking, setBooking] = useState(null);
  const [authorizations, setAuthorizations] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [publicUrl, setPublicUrl] = useState('');
  const customer = useMemo(() => pickCustomer(booking), [booking]);
  const amount = Number(booking?.total_amount ?? booking?.totalAmount ?? booking?.pricing?.total ?? booking?.amount ?? 0);
  const currency = booking?.currency || 'USD';

  const reload = async () => {
    setLoading(true); setError('');
    try {
      const [bookingResponse, authRows] = await Promise.all([
        adminAPI.getBookingById(code),
        boGet(`/payments/authorizations?entityType=FLIGHT&entityCode=${encodeURIComponent(code)}`).catch(() => []),
      ]);
      setBooking(unwrapBooking(bookingResponse));
      setAuthorizations(authRows || []);
    } catch (e) {
      setError(e.message || 'Unable to load payment authorization status.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, [code]);

  const createAuthorization = async () => {
    if (!customer.email) { setError('Add the customer email to the booking before creating a payment authorization.'); return; }
    const requested = window.prompt('Maximum amount the customer may authorize', amount > 0 ? String(amount) : '');
    if (requested === null) return;
    const authorizedAmount = Number(requested);
    if (!Number.isFinite(authorizedAmount) || authorizedAmount <= 0) { setError('Enter a positive authorized amount.'); return; }
    setCreating(true); setError(''); setPublicUrl('');
    try {
      const result = await boPost('/payments/authorizations', {
        entityType: 'FLIGHT', entityId: booking?.id || null, entityCode: code,
        customerName: customer.name, customerEmail: customer.email, customerPhone: customer.phone,
        authorizedAmount, currency, purpose: `Flight booking ${code}`,
        leadId: booking?.lead_id || null, tripId: booking?.trip_id || null,
        assignedAgentId: booking?.assigned_agent_id || null, teamId: booking?.team_id || null,
      });
      setPublicUrl(result.publicUrl);
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  return <section style={{ margin: '18px auto', width: 'min(1540px, calc(100% - 28px))' }}>
    <div className="bo-card" style={{ border: '1px solid #e4d4da' }}>
      <div className="secure-reveal-header">
        <div>
          <h2 style={{ margin: 0 }}>Payment Authorization</h2>
          <div className="bo-muted">Masked manual payment metadata attached to this flight without changing the existing itinerary, authorization-email, or ticketing workflow. Full card numbers and security codes are not stored.</div>
        </div>
        <div className="bo-actions">
          <Link className="bo-button secondary" to="/admin/payments/authorizations">All Authorizations</Link>
          <button className="bo-button" onClick={createAuthorization} disabled={creating || loading}>{creating ? 'Creating…' : 'Create Authorization'}</button>
        </div>
      </div>
      {error && <div className="bo-error">{error}</div>}
      {publicUrl && <div><strong>Customer payment-record link</strong><div className="secure-payment-created-link"><input readOnly value={publicUrl}/><button className="bo-button" onClick={() => navigator.clipboard?.writeText(publicUrl)}>Copy</button></div></div>}
      {loading ? <div className="bo-muted">Loading payment status…</div> : authorizations.length ? <div className="bo-table-wrap"><table className="bo-table"><thead><tr><th>Authorization</th><th>Maximum</th><th>Manual Card Record</th><th>Status</th><th>Action</th></tr></thead><tbody>{authorizations.map(auth => <tr key={auth.id}><td>{auth.authorizationCode}</td><td>{new Intl.NumberFormat('en-US',{style:'currency',currency:auth.currency||'USD'}).format(Number(auth.authorizedAmount||0))}</td><td>{maskedCard(auth.paymentMethod)}{auth.paymentMethod && <div className="bo-muted">Exp {expiry(auth.paymentMethod)} · not chargeable</div>}</td><td>{auth.status}</td><td><Link to={`/admin/payments/authorizations/${auth.id}`}>Open Payment Record</Link></td></tr>)}</tbody></table></div> : <div className="bo-muted">No payment authorization has been created for this booking yet.</div>}
    </div>
  </section>;
}
