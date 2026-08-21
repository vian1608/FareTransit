import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { boGet, boPost } from './backofficeApi';
import { useBackOfficeAuth } from './BackOfficeAuthContext';

const money = (value, currency = 'USD') => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0)); }
  catch { return `${currency} ${Number(value || 0).toFixed(2)}`; }
};
const fmtDate = value => value ? new Date(value).toLocaleString() : '—';
const fmtExpiry = method => method?.expMonth && method?.expYear ? `${String(method.expMonth).padStart(2, '0')}/${method.expYear}` : '—';

function Header({ title, subtitle, actions }) {
  return <div className="bo-page-header"><div><h1>{title}</h1>{subtitle && <div className="bo-muted">{subtitle}</div>}</div>{actions && <div className="bo-actions">{actions}</div>}</div>;
}
function ErrorBox({ message }) { return message ? <div className="bo-card bo-error">{message}</div> : null; }
function badge(status) { return <span className={`secure-payment-status secure-payment-status--${String(status || '').toLowerCase()}`}>{status || '—'}</span>; }
function maskedCard(method) {
  if (!method?.last4) return 'Not recorded';
  return `${String(method.cardBrand || 'Card').toUpperCase()} •••• ${method.last4}`;
}

export function PaymentAuthorizationsPage() {
  const { hasPermission } = useBackOfficeAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [createdUrl, setCreatedUrl] = useState('');
  const [form, setForm] = useState({ entityType: 'FLIGHT', entityCode: '', customerName: '', customerEmail: '', customerPhone: '', authorizedAmount: '', currency: 'USD', purpose: '' });

  const reload = async () => {
    setLoading(true); setError('');
    try { setRows(await boGet('/payments/authorizations') || []); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const submit = async e => {
    e.preventDefault(); setError(''); setCreatedUrl('');
    try {
      const result = await boPost('/payments/authorizations', form);
      setCreatedUrl(result.publicUrl);
      setShowForm(false);
      await reload();
    } catch (e) { setError(e.message); }
  };

  return <>
    <Header
      title="Payment Authorizations"
      subtitle="Manual masked payment records for FareTransit travel bookings"
      actions={hasPermission('payments.authorization.manage') && <button className="bo-button" onClick={() => setShowForm(v => !v)}>{showForm ? 'Close' : 'New Authorization'}</button>}
    />
    <ErrorBox message={error} />
    {createdUrl && <div className="bo-card"><strong>Customer payment-record link created</strong><div className="secure-payment-created-link"><input readOnly value={createdUrl} /><button className="bo-button" onClick={() => navigator.clipboard?.writeText(createdUrl)}>Copy Link</button></div><div className="bo-muted">The link lets the customer record only masked card metadata. It does not collect a full card number or security code.</div></div>}
    {showForm && <form className="bo-card bo-form" onSubmit={submit}>
      <h2>Create payment authorization record</h2>
      <div className="bo-form-grid">
        <select value={form.entityType} onChange={e => setForm({ ...form, entityType: e.target.value })}>{['FLIGHT','HOTEL','CAR','CRUISE','TOUR','ACTIVITY','PACKAGE','INSURANCE','TRIP','OTHER'].map(x => <option key={x}>{x}</option>)}</select>
        <input placeholder="Booking / product reference" value={form.entityCode} onChange={e => setForm({ ...form, entityCode: e.target.value })} />
        <input required placeholder="Customer name" value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} />
        <input required type="email" placeholder="Customer email" value={form.customerEmail} onChange={e => setForm({ ...form, customerEmail: e.target.value })} />
        <input placeholder="Customer phone" value={form.customerPhone} onChange={e => setForm({ ...form, customerPhone: e.target.value })} />
        <input required type="number" min="0.01" step="0.01" placeholder="Maximum authorized amount" value={form.authorizedAmount} onChange={e => setForm({ ...form, authorizedAmount: e.target.value })} />
        <input required placeholder="Currency" maxLength="3" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
        <input required placeholder="Purpose" value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} />
      </div>
      <div className="bo-actions"><button className="bo-button">Create Link</button></div>
    </form>}
    <div className="bo-card"><div className="bo-table-wrap"><table className="bo-table"><thead><tr><th>Authorization</th><th>Product</th><th>Customer</th><th>Maximum</th><th>Manual Card Record</th><th>Status</th><th>Created</th></tr></thead><tbody>
      {rows.map(row => <tr key={row.id}>
        <td><Link to={`/admin/payments/authorizations/${row.id}`}>{row.authorizationCode}</Link><div className="bo-muted">{row.context?.entityCode || row.context?.contextCode}</div></td>
        <td>{row.context?.entityType}</td>
        <td>{row.customerName}<div className="bo-muted">{row.customerEmail}</div></td>
        <td>{money(row.authorizedAmount, row.currency)}</td>
        <td>{maskedCard(row.paymentMethod)}{row.paymentMethod && <div className="bo-muted">Exp {fmtExpiry(row.paymentMethod)} · record only</div>}</td>
        <td>{badge(row.status)}</td>
        <td>{fmtDate(row.createdAt)}</td>
      </tr>)}
      {!loading && !rows.length && <tr><td colSpan="7" className="bo-muted">No payment authorizations yet.</td></tr>}
    </tbody></table></div>{loading && <div className="bo-muted">Loading authorizations…</div>}</div>
  </>;
}

export function PaymentAuthorizationDetailPage() {
  const { id } = useParams();
  const { hasPermission } = useBackOfficeAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [publicUrl, setPublicUrl] = useState('');

  const reload = async () => {
    setLoading(true); setError('');
    try { setData(await boGet(`/payments/authorizations/${id}`)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, [id]);

  const auth = data?.authorization;
  const method = auth?.paymentMethod;
  const sendLink = async () => {
    try { const result = await boPost(`/payments/authorizations/${id}/send`, {}); setPublicUrl(result.publicUrl); }
    catch (e) { setError(e.message); }
  };
  const requestUpdate = async () => {
    try { const result = await boPost(`/payments/authorizations/${id}/recollect`, { sendEmail: true }); setPublicUrl(result.publicUrl); await reload(); }
    catch (e) { setError(e.message); }
  };

  if (loading) return <div className="bo-card">Loading payment authorization…</div>;
  if (!auth) return <ErrorBox message={error || 'Authorization not found.'} />;

  const billing = method?.billingAddress || {};
  return <>
    <Header
      title={auth.authorizationCode}
      subtitle={`${auth.context?.entityType || 'TRAVEL'} · ${auth.context?.entityCode || auth.context?.contextCode || ''}`}
      actions={<><Link className="bo-button secondary" to="/admin/payments/authorizations">Back</Link>{hasPermission('payments.authorization.manage') && <button className="bo-button" onClick={sendLink}>Send New Link</button>}</>}
    />
    <ErrorBox message={error} />
    {publicUrl && <div className="bo-card"><strong>Latest customer link</strong><div className="secure-payment-created-link"><input readOnly value={publicUrl} /><button className="bo-button" onClick={() => navigator.clipboard?.writeText(publicUrl)}>Copy</button></div></div>}

    <div className="bo-grid">
      <div className="bo-card bo-kpi"><span className="bo-muted">Authorized maximum</span><strong>{money(auth.authorizedAmount, auth.currency)}</strong></div>
      <div className="bo-card bo-kpi"><span className="bo-muted">Authorization</span><strong>{auth.status}</strong></div>
      <div className="bo-card bo-kpi"><span className="bo-muted">Payment record</span><strong>{method ? 'RECORDED' : 'NOT RECORDED'}</strong></div>
      <div className="bo-card bo-kpi"><span className="bo-muted">Chargeable credential</span><strong>NOT STORED</strong></div>
    </div>

    <div className="bo-two-col">
      <div className="bo-card"><h2>Customer & purpose</h2><p><strong>{auth.customerName}</strong><br />{auth.customerEmail}<br />{auth.customerPhone || '—'}</p><p>{auth.purpose}</p><p className="bo-muted">Recorded authorization time: {fmtDate(auth.authorizedAt)}</p></div>
      <div className="bo-card"><h2>Manual masked payment record</h2>{method ? <><p><strong>{maskedCard(method)}</strong><br />Expiration: {fmtExpiry(method)}<br />Cardholder: {method.cardholderName || '—'}</p><p className="bo-muted">Source: {method.source || 'MANUAL_METADATA'} · This record cannot be used by the application to charge the card.</p></> : <p className="bo-muted">No masked payment record has been submitted.</p>}</div>
    </div>

    {method && <div className="bo-card"><h2>Billing metadata</h2><p>{billing.line1 || '—'}{billing.line2 ? <><br />{billing.line2}</> : null}<br />{[billing.city, billing.region, billing.postalCode].filter(Boolean).join(', ')}<br />{billing.country || ''}</p></div>}

    <div className="bo-card"><h2>Payment storage policy</h2><p>FareTransit stores only masked manual payment metadata: cardholder, brand, last four digits, expiration and billing details. Full card numbers and card security codes are not available in the admin panel.</p>{hasPermission('payments.authorization.manage') && <div className="bo-actions"><button className="bo-button secondary" onClick={requestUpdate}>{method ? 'Request Metadata Update' : 'Request Payment Record'}</button></div>}</div>

    <div className="bo-card"><h2>Authorization activity</h2>{(data?.authorizationEvents || []).map(event => <div key={event.id} style={{ padding: '0.65rem 0', borderBottom: '1px solid #eef2f7' }}><strong>{event.event_type}</strong><div className="bo-muted">{fmtDate(event.created_at)}</div></div>)}{!(data?.authorizationEvents || []).length && <div className="bo-muted">No activity yet.</div>}</div>
  </>;
}
