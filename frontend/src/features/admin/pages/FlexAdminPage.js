import React, { useEffect, useMemo, useState } from 'react';
import { bookingAPI } from '../../../shared/api/api';
import './FlexAdminPage.css';

const STATUSES = ['REQUESTED','REVIEWING','OPTION_FOUND','CUSTOMER_APPROVAL','REBOOKING','COMPLETED','DECLINED','CANCELLED'];
const bookingFromResponse = (response) => response?.data?.booking || response?.data || response?.booking || response;
const pretty = (value) => String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function headers() {
  const token = localStorage.getItem('token');
  return { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function api(path, options = {}) {
  const response = await fetch(`/api/addons${path}`, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.success) throw new Error(body?.error?.message || `Request failed (${response.status})`);
  return body;
}

export default function FlexAdminPage() {
  const initialRef = new URLSearchParams(window.location.search).get('booking') || '';
  const [reference, setReference] = useState(initialRef);
  const [booking, setBooking] = useState(null);
  const [requests, setRequests] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => { if (!localStorage.getItem('token')) window.location.assign('/admin/login'); }, []);

  const hydrate = (rows) => setDrafts(Object.fromEntries(rows.map((r) => [r.id, { status: r.status, adminNotes: r.admin_notes || '' }])));
  const reload = async (ref = booking?.confirmation_code || booking?.confirmationCode || booking?.id) => {
    if (!ref) return;
    const body = await api(`/admin/flex/${encodeURIComponent(ref)}/change-requests`);
    const rows = Array.isArray(body.data) ? body.data : [];
    setRequests(rows); hydrate(rows);
  };

  const load = async (ref = reference) => {
    const clean = String(ref || '').trim(); if (!clean) return;
    setBusy('search'); setError(''); setNotice('');
    try {
      const found = bookingFromResponse(await bookingAPI.getByReference(clean));
      if (!found?.id) throw new Error('Booking not found.');
      const flex = found.flexAssist || found.flex_assist || found.tripAddons?.flexAssist || found.trip_addons?.flexAssist;
      setBooking({ ...found, resolvedFlex: flex });
      await reload(found.confirmation_code || found.confirmationCode || found.id);
      const url = new URL(window.location.href); url.searchParams.set('booking', found.confirmation_code || clean); window.history.replaceState({}, '', url);
    } catch (e) { setBooking(null); setRequests([]); setError(e.message || 'Unable to load Flex Assist.'); }
    finally { setBusy(''); }
  };
  useEffect(() => { if (initialRef) load(initialRef); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const save = async (request) => {
    const d = drafts[request.id] || {};
    setBusy(request.id); setError(''); setNotice('');
    try {
      await api(`/admin/flex/${encodeURIComponent(booking.confirmation_code || booking.confirmationCode || booking.id)}/change-requests/${encodeURIComponent(request.id)}`, { method: 'PATCH', body: JSON.stringify({ status: d.status, adminNotes: d.adminNotes }) });
      setNotice(`Flex request updated to ${pretty(d.status)}.`); await reload();
    } catch (e) { setError(e.message || 'Unable to update Flex request.'); }
    finally { setBusy(''); }
  };

  const flex = booking?.resolvedFlex;
  const activeCount = useMemo(() => requests.filter((r) => !['COMPLETED','DECLINED','CANCELLED'].includes(r.status)).length, [requests]);

  return <main className="admin-flex-page"><div className="admin-flex-shell">
    <header className="admin-flex-header"><div><span>TRIP ADD-ONS</span><h1>Flex Assist Requests</h1><p>Review eligible change requests, find alternatives, obtain customer approval, and track rebooking completion.</p></div><nav><a href="/admin/baggage">Baggage Requests</a><a href="/admin/dashboard">Admin Dashboard</a></nav></header>
    <form className="admin-flex-search" onSubmit={(e) => { e.preventDefault(); load(); }}><input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Booking confirmation code"/><button disabled={busy === 'search'}>{busy === 'search' ? 'Loading…' : 'Load Booking'}</button></form>
    {error && <div className="admin-flex-alert error">{error}</div>}{notice && <div className="admin-flex-alert">{notice}</div>}
    {booking && <section className="admin-flex-summary"><div><span>Booking</span><strong>{booking.confirmation_code || booking.confirmationCode}</strong></div><div><span>Flex Assist</span><strong>{flex?.selected ? `${pretty(flex.status || 'ACTIVE')} · $${Number(flex.price || 0).toFixed(2)}` : 'Not selected'}</strong></div><div><span>Terms</span><strong>{flex?.termsVersion || '—'}</strong></div><div><span>Open requests</span><strong>{activeCount}</strong></div></section>}
    {booking && !flex?.selected && <div className="admin-flex-empty">This booking does not have Flex Assist.</div>}
    {booking && flex?.selected && !requests.length && <div className="admin-flex-empty">Flex Assist is active, but no change request has been submitted.</div>}
    <div className="admin-flex-list">{requests.map((r) => { const d = drafts[r.id] || {}; return <article key={r.id} className="admin-flex-card"><div className="admin-flex-card__main"><span>{pretty(r.request_type)}</span><h2>{pretty(r.status)}</h2><p>{r.requested_details?.notes || 'No customer notes provided.'}</p><small>Submitted {new Date(r.created_at).toLocaleString()}</small></div><label>Status<select value={d.status || r.status} onChange={(e) => setDrafts((prev) => ({ ...prev, [r.id]: { ...d, status: e.target.value } }))}>{STATUSES.map((s) => <option value={s} key={s}>{pretty(s)}</option>)}</select></label><label>Admin notes<textarea rows="3" value={d.adminNotes ?? ''} onChange={(e) => setDrafts((prev) => ({ ...prev, [r.id]: { ...d, adminNotes: e.target.value } }))}/></label><button disabled={busy === r.id} onClick={() => save(r)}>{busy === r.id ? 'Saving…' : 'Save Update'}</button></article>; })}</div>
  </div></main>;
}
