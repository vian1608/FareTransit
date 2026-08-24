import React, { useEffect, useMemo, useState } from 'react';
import { bookingAPI } from '../../../shared/api/api';
import addonAPI from '../../bookings/addons/addonApi';
import './BaggageAdminPage.css';

const STATUSES = ['REQUESTED','CHECKING_AVAILABILITY','AVAILABLE','PRICE_CONFIRMED','OFFER_SENT','AWAITING_PAYMENT','PAID','PURCHASE_PENDING','CONFIRMED','UNAVAILABLE','DECLINED_BY_CUSTOMER','PRICE_EXPIRED','PAYMENT_FAILED','PURCHASE_FAILED','REFUNDED','CANCELLED'];
const latest = (list = []) => [...list].sort((a,b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))[0] || null;
const passengerName = (request) => { const t = request?.traveller || {}; return [t.first_name,t.middle_name,t.last_name].filter(Boolean).join(' ') || `Passenger ${(request?.passenger_index ?? 0) + 1}`; };
const bookingFromResponse = (response) => response?.data?.booking || response?.data || response?.booking || response;
const toLocalInput = (value) => { if (!value) return ''; const d = new Date(value); if (Number.isNaN(d.getTime())) return ''; return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16); };

export default function BaggageAdminPage() {
  const initialRef = new URLSearchParams(window.location.search).get('booking') || '';
  const [reference,setReference] = useState(initialRef), [booking,setBooking] = useState(null), [requests,setRequests] = useState([]), [drafts,setDrafts] = useState({}), [busy,setBusy] = useState(''), [error,setError] = useState(''), [notice,setNotice] = useState('');
  useEffect(() => { if (!localStorage.getItem('token')) window.location.assign('/admin/login'); }, []);

  const hydrate = (rows) => {
    const next = {};
    rows.forEach((r) => { const q = latest(r.quotes || []), f = latest(r.fulfillments || []); next[r.id] = { supplierCost:q?.supplier_cost ?? '', customerPrice:q?.customer_price ?? '', currency:q?.currency || r.booking?.currency || 'USD', validUntil:toLocalInput(q?.valid_until), paymentProvider:'manual', providerTransactionId:'', supplier:f?.supplier || '', supplierReference:f?.supplier_reference || '', notes:f?.notes || '' }; });
    setDrafts(next);
  };
  const reload = async (bookingId = booking?.id) => { if (!bookingId) return; const response = await addonAPI.adminListByBooking(bookingId); const rows = Array.isArray(response?.data) ? response.data : []; setRequests(rows); hydrate(rows); };
  const load = async (ref = reference) => {
    const clean = String(ref || '').trim(); if (!clean) return;
    setBusy('search'); setError(''); setNotice('');
    try { const found = bookingFromResponse(await bookingAPI.getByReference(clean)); if (!found?.id) throw new Error('Booking not found.'); setBooking(found); await reload(found.id); const url = new URL(window.location.href); url.searchParams.set('booking', found.confirmation_code || clean); window.history.replaceState({},'',url); }
    catch (e) { setBooking(null); setRequests([]); setError(e.message || 'Unable to load baggage requests.'); }
    finally { setBusy(''); }
  };
  useEffect(() => { if (initialRef) load(initialRef); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const draft = (id,key,value) => setDrafts((prev) => ({...prev,[id]:{...(prev[id] || {}),[key]:value}}));
  const act = async (key, fn, success) => { setBusy(key); setError(''); setNotice(''); try { const result = await fn(); setNotice(success || result?.message || 'Updated.'); await reload(); } catch (e) { setError(e.message || 'Action failed.'); } finally { setBusy(''); } };
  const totalMargin = useMemo(() => requests.reduce((sum,r) => { const q = latest(r.quotes || []); return sum + (q ? Number(q.customer_price || 0) - Number(q.supplier_cost || 0) : 0); },0),[requests]);

  return <main className="admin-baggage-page"><div className="admin-baggage-shell">
    <header className="admin-baggage-header"><div><span>TRIP ADD-ONS</span><h1>Checked Baggage Requests</h1><p>Verify supplier availability, set the selling price, send the separate offer, record payment, and confirm fulfillment.</p></div><a href="/admin/dashboard">Back to Admin</a></header>
    <form className="admin-baggage-search" onSubmit={(e) => { e.preventDefault(); load(); }}><input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Booking confirmation code"/><button disabled={busy === 'search'}>{busy === 'search' ? 'Loading…' : 'Load Booking'}</button></form>
    {error && <div className="admin-baggage-alert error">{error}</div>}{notice && <div className="admin-baggage-alert">{notice}</div>}
    {booking && <section className="admin-baggage-summary"><div><span>Booking</span><strong>{booking.confirmation_code || booking.id}</strong></div><div><span>Customer</span><strong>{booking.passenger_name || booking.email || 'Customer'}</strong></div><div><span>Requests</span><strong>{requests.length}</strong></div><div><span>Quoted margin</span><strong>${totalMargin.toFixed(2)}</strong></div></section>}
    {booking && !requests.length && <div className="admin-baggage-empty">This booking has no checked baggage requests.</div>}
    <div className="admin-baggage-list">{requests.map((r) => { const q=latest(r.quotes||[]), p=latest(r.payments||[]), f=latest(r.fulfillments||[]), d=drafts[r.id]||{}; const margin=Number(d.customerPrice)-Number(d.supplierCost); return <article className="admin-baggage-card" key={r.id}>
      <div className="admin-baggage-top"><div><span>PASSENGER</span><h2>{passengerName(r)}</h2><p>{r.journey_direction === 'RETURN' ? 'Return' : 'Outbound'} · {r.quantity} checked bag{r.quantity===1?'':'s'} · {r.requested_weight_kg || 23} kg</p></div><select value={r.status} onChange={(e) => act(`${r.id}:status`,()=>addonAPI.adminUpdateStatus(r.id,e.target.value),`Status updated to ${e.target.value}.`)}>{STATUSES.map((s)=><option key={s}>{s}</option>)}</select></div>
      <div className="admin-baggage-grid"><label>Supplier cost<input type="number" min="0" step="0.01" value={d.supplierCost ?? ''} onChange={(e)=>draft(r.id,'supplierCost',e.target.value)}/></label><label>Customer price<input type="number" min="0" step="0.01" value={d.customerPrice ?? ''} onChange={(e)=>draft(r.id,'customerPrice',e.target.value)}/></label><label>Currency<input maxLength="3" value={d.currency || 'USD'} onChange={(e)=>draft(r.id,'currency',e.target.value.toUpperCase())}/></label><label>Quote valid until<input type="datetime-local" value={d.validUntil || ''} onChange={(e)=>draft(r.id,'validUntil',e.target.value)}/></label></div>
      <div className="admin-baggage-margin"><span>Gross margin</span><strong>{Number.isFinite(margin) ? `$${margin.toFixed(2)}` : '—'}</strong></div>
      <div className="admin-baggage-actions"><button onClick={()=>act(`${r.id}:quote`,()=>addonAPI.adminQuote(r.id,{supplierCost:d.supplierCost,customerPrice:d.customerPrice,currency:d.currency,validUntil:d.validUntil?new Date(d.validUntil).toISOString():null}),'Baggage quote saved.')}>Save Confirmed Price</button><button className="primary" disabled={!q} onClick={()=>act(`${r.id}:offer`,()=>addonAPI.adminSendOffer(r.id),'Baggage offer sent; awaiting separate payment.')}>Send Baggage Offer</button><button onClick={()=>act(`${r.id}:checking`,()=>addonAPI.adminUpdateStatus(r.id,'CHECKING_AVAILABILITY'),'Marked as checking availability.')}>Checking Availability</button><button onClick={()=>act(`${r.id}:unavailable`,()=>addonAPI.adminUpdateStatus(r.id,'UNAVAILABLE'),'Marked unavailable.')}>Unavailable</button></div>
      <section className="admin-baggage-sub"><h3>Payment</h3><p>Current: <strong>{p?.status || 'NOT PAID'}</strong>{q && <> · {q.currency} {Number(q.customer_price).toFixed(2)}</>}</p><div className="admin-baggage-grid two"><label>Provider<input value={d.paymentProvider || 'manual'} onChange={(e)=>draft(r.id,'paymentProvider',e.target.value)}/></label><label>Transaction/reference<input value={d.providerTransactionId || ''} onChange={(e)=>draft(r.id,'providerTransactionId',e.target.value)}/></label></div><button disabled={!q} onClick={()=>act(`${r.id}:payment`,()=>addonAPI.adminRecordPayment(r.id,{amount:q?.customer_price,currency:q?.currency||d.currency,paymentProvider:d.paymentProvider,providerTransactionId:d.providerTransactionId||null}),'Baggage payment recorded; purchase pending.')}>Record Separate Payment</button></section>
      <section className="admin-baggage-sub"><h3>Supplier fulfillment</h3><div className="admin-baggage-grid"><label>Supplier<input value={d.supplier||''} onChange={(e)=>draft(r.id,'supplier',e.target.value)}/></label><label>Supplier confirmation<input value={d.supplierReference||''} onChange={(e)=>draft(r.id,'supplierReference',e.target.value)}/></label><label>Notes<input value={d.notes||''} onChange={(e)=>draft(r.id,'notes',e.target.value)}/></label></div><div className="admin-baggage-actions"><button className="primary" onClick={()=>act(`${r.id}:confirm`,()=>addonAPI.adminFulfill(r.id,{supplier:d.supplier,supplierReference:d.supplierReference,notes:d.notes,status:'CONFIRMED'}),'Baggage confirmed and confirmation email processed.')}>Confirm Baggage</button><button onClick={()=>act(`${r.id}:fail`,()=>addonAPI.adminFulfill(r.id,{supplier:d.supplier,supplierReference:d.supplierReference,notes:d.notes,status:'PURCHASE_FAILED'}),'Purchase marked failed.')}>Purchase Failed</button></div>{f && <p>Latest fulfillment: {f.status}{f.supplier_reference ? ` · ${f.supplier_reference}` : ''}</p>}</section>
    </article>; })}</div>
  </div></main>;
}
