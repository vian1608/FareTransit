import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { boGet } from './backofficeApi';
import { useBackOfficeAuth } from './BackOfficeAuthContext';

const money = (value, currency = 'USD') => {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(Number(value || 0)); }
  catch { return `$${Number(value || 0).toFixed(2)}`; }
};
const date = value => value ? new Date(value).toLocaleDateString() : '—';
const safeArray = value => Array.isArray(value) ? value : Array.isArray(value?.rows) ? value.rows : Array.isArray(value?.data) ? value.data : [];
const first = (...values) => values.find(value => value !== undefined && value !== null && value !== '') ?? '';

function normalizeBooking(record, type) {
  const reference = first(record.confirmation_code, record.booking_reference, record.reference, record.trip_code, record.id);
  const customer = first(record.passenger_name, record.customer_name, record.guest_name, record.renter_name, record.full_name, record.email, 'Customer');
  const email = first(record.email, record.customer_email, record.guest_email, record.renter_email);
  const total = Number(first(record.total_amount, record.customer_total, record.customer_price, record.total, record.amount, 0));
  const status = String(first(record.status, record.booking_status, record.reservation_status, 'PENDING')).toUpperCase();
  const payment = String(first(record.payment_status, record.paymentStatus, record.payment_state, '')).toUpperCase();
  const authorization = String(first(record.authorization_status, record.authorizationStatus, '')).toUpperCase();
  const createdAt = first(record.created_at, record.createdAt, record.updated_at, record.updatedAt);
  const travelDate = first(record.departure_date, record.check_in, record.check_in_date, record.pickup_at, record.travel_date, record.start_date);
  const id = first(record.id, reference);
  return { raw: record, type, id, reference: String(reference || id || '—'), customer, email, total, currency: record.currency || 'USD', status, payment, authorization, createdAt, travelDate };
}

function bookingHref(booking) {
  if (booking.type === 'flight') return `/admin/bookings/flights/${encodeURIComponent(booking.reference)}`;
  if (booking.type === 'hotel') return `/admin/bookings/hotels/${encodeURIComponent(booking.id)}`;
  return `/admin/bookings/cars/${encodeURIComponent(booking.id)}`;
}

function StatusBadge({ value }) {
  const status = String(value || 'PENDING').toUpperCase();
  const positive = ['DONE', 'COMPLETED', 'TICKETED', 'AUTHORIZED', 'PAID', 'BOOKED', 'CONFIRMED', 'DELIVERED'].some(x => status.includes(x));
  const negative = ['FAILED', 'CANCELLED', 'CANCELED', 'REFUNDED'].some(x => status.includes(x));
  return <span className={`ops-status ${positive ? 'is-success' : negative ? 'is-danger' : 'is-pending'}`}>{status.replaceAll('_', ' ')}</span>;
}

function PageTitle({ eyebrow, title, subtitle, actions }) {
  return <div className="ops-page-title"><div>{eyebrow && <div className="ops-eyebrow">{eyebrow}</div>}<h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{actions && <div className="ops-title-actions">{actions}</div>}</div>;
}

function LoadingCard({ text = 'Loading…' }) { return <div className="ops-card ops-empty">{text}</div>; }
function ErrorCard({ message }) { return message ? <div className="ops-card ops-error">{message}</div> : null; }

function useAllBookings() {
  const [state, setState] = useState({ loading: true, rows: [], errors: [] });
  useEffect(() => {
    let active = true;
    (async () => {
      const results = await Promise.allSettled([
        boGet('/bookings/flights'),
        boGet('/bookings/hotels'),
        boGet('/bookings/cars')
      ]);
      if (!active) return;
      const rows = [
        ...(results[0].status === 'fulfilled' ? safeArray(results[0].value).map(x => normalizeBooking(x, 'flight')) : []),
        ...(results[1].status === 'fulfilled' ? safeArray(results[1].value).map(x => normalizeBooking(x, 'hotel')) : []),
        ...(results[2].status === 'fulfilled' ? safeArray(results[2].value).map(x => normalizeBooking(x, 'car')) : [])
      ];
      const errors = results.filter(x => x.status === 'rejected').map(x => x.reason?.message || 'Unable to load a booking service.');
      setState({ loading: false, rows, errors });
    })();
    return () => { active = false; };
  }, []);
  return state;
}

export function AdminHomePage() {
  const { profile } = useBackOfficeAuth();
  const bookings = useAllBookings();
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState('');
  useEffect(() => { boGet('/dashboard/summary').then(setSummary).catch(error => setSummaryError(error.message)); }, []);

  const sorted = useMemo(() => [...bookings.rows].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)), [bookings.rows]);
  const needsAttention = useMemo(() => sorted.filter(row => !['DONE','COMPLETED','TICKETED','BOOKED','CONFIRMED','CANCELLED','CANCELED'].includes(row.status)).slice(0, 6), [sorted]);
  const pendingAuth = bookings.rows.filter(row => row.authorization.includes('PENDING') || row.status.includes('AUTH')).length;
  const recordedRevenue = Number(first(summary?.finance?.revenue, summary?.finance?.grossSales, summary?.finance?.sales, 0));
  const fallbackRevenue = bookings.rows.filter(row => row.payment === 'PAID').reduce((sum, row) => sum + row.total, 0);
  const displayName = first(profile?.name, profile?.roleName, profile?.role, 'Owner');

  return <>
    <PageTitle title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${displayName}`} subtitle="Here is what needs your attention across FareTransit today." actions={<Link className="bo-button" to="/admin/bookings/new">+ New Booking</Link>} />
    <ErrorCard message={summaryError || bookings.errors[0]} />
    <div className="ops-kpi-grid">
      <div className="ops-kpi"><span>Bookings</span><strong>{bookings.loading ? '—' : bookings.rows.length}</strong><small>Across flights, hotels and cars</small></div>
      <div className="ops-kpi"><span>Need action</span><strong>{bookings.loading ? '—' : needsAttention.length}</strong><small>Open operational work</small></div>
      <div className="ops-kpi"><span>Recorded revenue</span><strong>{money(recordedRevenue || fallbackRevenue)}</strong><small>Paid/summary data available now</small></div>
      <div className="ops-kpi"><span>Authorization pending</span><strong>{bookings.loading ? '—' : pendingAuth}</strong><small>Customer approval workflow</small></div>
    </div>

    <section className="ops-card">
      <div className="ops-card-heading"><div><span className="ops-eyebrow">Priority queue</span><h2>Needs attention</h2></div><Link to="/admin/bookings">View all bookings</Link></div>
      {bookings.loading ? <div className="ops-empty">Loading booking activity…</div> : needsAttention.length ? <div className="ops-list">{needsAttention.map(row => <Link className="ops-attention-row" key={`${row.type}-${row.id}`} to={bookingHref(row)}><div className="ops-service-icon">{row.type.charAt(0).toUpperCase()}</div><div className="ops-row-main"><strong>{row.reference}</strong><span>{row.customer} · {row.type.charAt(0).toUpperCase() + row.type.slice(1)}</span></div><StatusBadge value={row.status} /><span className="ops-open">Open →</span></Link>)}</div> : <div className="ops-empty">Nothing urgent right now.</div>}
    </section>

    <section className="ops-card">
      <div className="ops-card-heading"><div><span className="ops-eyebrow">Latest activity</span><h2>Recent bookings</h2></div></div>
      {bookings.loading ? <div className="ops-empty">Loading…</div> : <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Reference</th><th>Customer</th><th>Service</th><th>Total</th><th>Status</th><th>Date</th></tr></thead><tbody>{sorted.slice(0, 8).map(row => <tr key={`${row.type}-${row.id}`}><td><Link to={bookingHref(row)}>{row.reference}</Link></td><td><strong>{row.customer}</strong>{row.email && <small>{row.email}</small>}</td><td className="ops-capitalize">{row.type}</td><td>{money(row.total, row.currency)}</td><td><StatusBadge value={row.status} /></td><td>{date(row.createdAt)}</td></tr>)}</tbody></table>{!sorted.length && <div className="ops-empty">No bookings yet.</div>}</div>}
    </section>
  </>;
}

export function UnifiedBookingsPage() {
  const data = useAllBookings();
  const [params, setParams] = useSearchParams();
  const type = params.get('type') || 'all';
  const query = params.get('q') || '';
  const status = params.get('status') || '';
  const setFilter = (key, value) => { const next = new URLSearchParams(params); if (!value || value === 'all') next.delete(key); else next.set(key, value); setParams(next); };
  const statuses = useMemo(() => [...new Set(data.rows.map(row => row.status).filter(Boolean))].sort(), [data.rows]);
  const rows = useMemo(() => data.rows.filter(row => {
    if (type !== 'all' && row.type !== type) return false;
    if (status && row.status !== status) return false;
    const haystack = `${row.reference} ${row.customer} ${row.email} ${row.type}`.toLowerCase();
    return !query || haystack.includes(query.toLowerCase());
  }).sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)), [data.rows, type, status, query]);

  return <>
    <PageTitle eyebrow="Operations" title="Bookings" subtitle="One workspace for every FareTransit reservation." actions={<Link className="bo-button" to="/admin/bookings/new">+ New Booking</Link>} />
    <div className="ops-tabs" role="tablist" aria-label="Booking type">{['all','flight','hotel','car'].map(item => <button key={item} className={type === item ? 'active' : ''} onClick={() => setFilter('type', item)}>{item === 'all' ? 'All' : `${item.charAt(0).toUpperCase()}${item.slice(1)}s`}</button>)}</div>
    <div className="ops-filterbar"><label className="ops-search"><span>⌕</span><input value={query} onChange={e => setFilter('q', e.target.value)} placeholder="Search reference, customer or email" /></label><select value={status} onChange={e => setFilter('status', e.target.value)}><option value="">All statuses</option>{statuses.map(value => <option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select>{(query || status) && <button className="ops-clear" onClick={() => { const next = new URLSearchParams(); if (type !== 'all') next.set('type', type); setParams(next); }}>Clear filters</button>}</div>
    {data.loading ? <LoadingCard text="Loading bookings…" /> : <>{data.errors.length > 0 && <ErrorCard message={`${data.errors.length} service source(s) could not be loaded. Available bookings are still shown.`} />}<div className="ops-card ops-card--table"><div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Reference</th><th>Customer</th><th>Type</th><th>Travel date</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>{rows.map(row => <tr key={`${row.type}-${row.id}`}><td><Link to={bookingHref(row)}>{row.reference}</Link></td><td><strong>{row.customer}</strong>{row.email && <small>{row.email}</small>}</td><td className="ops-capitalize">{row.type}</td><td>{date(row.travelDate)}</td><td>{money(row.total, row.currency)}</td><td><StatusBadge value={row.status} /></td><td><Link className="ops-open-link" to={bookingHref(row)}>View →</Link></td></tr>)}</tbody></table>{!rows.length && <div className="ops-empty">No bookings match these filters.</div>}</div></div></>}
  </>;
}

export function NewBookingPage() {
  return <>
    <PageTitle eyebrow="Bookings" title="Create a booking" subtitle="Choose the service. The rest of the admin stays in one unified workspace." actions={<Link className="bo-button secondary" to="/admin/bookings">Cancel</Link>} />
    <div className="ops-choice-grid">
      <Link className="ops-choice" to="/admin/bookings/new/flight"><div className="ops-choice-icon">✈</div><div><h2>Flight</h2><p>Create a flight booking with passenger, itinerary, pricing and authorization details.</p></div><span>Continue →</span></Link>
      <Link className="ops-choice" to="/admin/bookings/new/hotel"><div className="ops-choice-icon">H</div><div><h2>Hotel</h2><p>Create a hotel request with destination, property, dates and customer total.</p></div><span>Continue →</span></Link>
      <Link className="ops-choice" to="/admin/bookings/new/car"><div className="ops-choice-icon">C</div><div><h2>Car rental</h2><p>Create a car rental request with pickup, drop-off and rental details.</p></div><span>Continue →</span></Link>
    </div>
  </>;
}

export function CustomersHubPage() {
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [query, setQuery] = useState('');
  useEffect(() => { boGet('/crm/customers').then(value => setRows(safeArray(value))).catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  const filtered = rows.filter(row => `${row.first_name || ''} ${row.last_name || ''} ${row.email || ''} ${row.phone || ''}`.toLowerCase().includes(query.toLowerCase()));
  return <><PageTitle eyebrow="Relationships" title="Customers" subtitle="Simple customer records with their travel history one click away." /><div className="ops-filterbar"><label className="ops-search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, email or phone" /></label></div><ErrorCard message={error} />{loading ? <LoadingCard /> : <div className="ops-card ops-card--table"><div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Customer</th><th>Email</th><th>Phone</th><th>Latest destination</th><th>Stage</th><th></th></tr></thead><tbody>{filtered.map((row,index) => { const id = first(row.id, row.customer_id, row.email, index); return <tr key={id}><td><strong>{[row.first_name,row.last_name].filter(Boolean).join(' ') || row.customer_name || 'Customer'}</strong></td><td>{row.email || '—'}</td><td>{row.phone || '—'}</td><td>{row.destination || '—'}</td><td><StatusBadge value={row.status || 'CUSTOMER'} /></td><td><Link className="ops-open-link" to={`/admin/customers/${encodeURIComponent(id)}`}>Open →</Link></td></tr>; })}</tbody></table>{!filtered.length && <div className="ops-empty">No customers found.</div>}</div></div>}</>;
}

export function CustomerDetailPage() {
  const { id } = useParams(); const bookings = useAllBookings(); const [customers, setCustomers] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { boGet('/crm/customers').then(value => setCustomers(safeArray(value))).catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  const customer = customers.find((row,index) => String(first(row.id,row.customer_id,row.email,index)) === decodeURIComponent(id));
  const related = customer ? bookings.rows.filter(row => (customer.email && row.email && row.email.toLowerCase() === customer.email.toLowerCase()) || (customer.phone && row.raw?.phone === customer.phone)) : [];
  if (loading) return <LoadingCard text="Loading customer…" />;
  if (!customer) return <><PageTitle title="Customer" actions={<Link className="bo-button secondary" to="/admin/customers">← Customers</Link>} /><ErrorCard message={error || 'Customer not found.'} /></>;
  const name = [customer.first_name,customer.last_name].filter(Boolean).join(' ') || customer.customer_name || 'Customer';
  return <><PageTitle eyebrow="Customer" title={name} subtitle={customer.email || customer.phone || 'FareTransit customer'} actions={<Link className="bo-button secondary" to="/admin/customers">← Customers</Link>} /><div className="ops-detail-grid"><div className="ops-card"><span className="ops-eyebrow">Contact</span><h2>{name}</h2><p>{customer.email || 'No email'}<br/>{customer.phone || 'No phone'}</p></div><div className="ops-card"><span className="ops-eyebrow">Latest travel</span><h2>{customer.destination || 'No destination saved'}</h2><p>{customer.status || 'Customer'}{customer.estimated_value ? ` · ${money(customer.estimated_value)}` : ''}</p></div><div className="ops-card"><span className="ops-eyebrow">Bookings found</span><h2>{bookings.loading ? '—' : related.length}</h2><p>Matched by saved customer contact details</p></div></div><section className="ops-card"><div className="ops-card-heading"><h2>Booking history</h2></div>{bookings.loading ? <div className="ops-empty">Loading bookings…</div> : related.length ? <div className="ops-list">{related.map(row => <Link className="ops-attention-row" to={bookingHref(row)} key={`${row.type}-${row.id}`}><div className="ops-service-icon">{row.type.charAt(0).toUpperCase()}</div><div className="ops-row-main"><strong>{row.reference}</strong><span>{row.type} · {money(row.total,row.currency)}</span></div><StatusBadge value={row.status}/><span className="ops-open">Open →</span></Link>)}</div> : <div className="ops-empty">No bookings matched this customer yet.</div>}</section></>;
}

export function PaymentsNav({ children, active = 'transactions' }) {
  return <><PageTitle eyebrow="Finance" title="Payments" subtitle="Transactions, customer authorizations and refunds in one place." /><div className="ops-tabs"><Link className={active === 'transactions' ? 'active' : ''} to="/admin/payments">Transactions</Link><Link className={active === 'authorizations' ? 'active' : ''} to="/admin/payments/authorizations">Authorizations</Link><Link className={active === 'refunds' ? 'active' : ''} to="/admin/payments/refunds">Refunds</Link></div><div className="ops-embedded-page">{children}</div></>;
}

export function SettingsHomePage() {
  const cards = [
    ['Business','Company defaults and operational configuration.','/admin/settings/business','B'],
    ['Users & Permissions','Team access, roles and responsibilities.','/admin/settings/users','U'],
    ['Email','Customer email templates and messaging configuration.','/admin/settings/email','E'],
    ['Integrations','Connected services and operational integrations.','/admin/settings/integrations','I'],
    ['Security','Authentication and admin security controls.','/admin/settings/security','S'],
    ['Audit Log','Review important admin and operational activity.','/admin/settings/audit','A']
  ];
  return <><PageTitle eyebrow="Administration" title="Settings" subtitle="Configuration stays out of daily operations until you need it." /><div className="ops-settings-grid">{cards.map(([title,description,href,icon]) => <Link className="ops-setting-card" key={title} to={href}><div className="ops-setting-icon">{icon}</div><div><h2>{title}</h2><p>{description}</p></div><span>Open →</span></Link>)}</div></>;
}

export function SettingsBack({ title, children }) { return <><div className="ops-subnav"><Link to="/admin/settings">← Settings</Link><strong>{title}</strong></div>{children}</>; }

export function LegacyRedirect({ to }) { const params = useParams(); const navigate = useNavigate(); useEffect(() => { let target = to; Object.entries(params).forEach(([key,value]) => { target = target.replace(`:${key}`, encodeURIComponent(value)); }); navigate(target, { replace: true }); }, [navigate, params, to]); return <LoadingCard text="Opening…" />; }
