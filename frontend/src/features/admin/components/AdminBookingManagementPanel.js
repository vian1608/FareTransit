import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { adminAPI, getApiErrorMessage } from '../../../shared/api/api';
import AdminEmailPreviewModal from '../../../shared/components/admin/AdminEmailPreviewModal';
import AdminGdsImportModalV2 from './AdminGdsImportModalV2';
import './AdminBookingManagementPanel.css';

const text = value => (value === null || value === undefined ? '' : String(value));
const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const normalizeStatus = value => text(value || 'PENDING').toUpperCase();
const unwrapBooking = response => response?.booking || response?.data?.booking || response?.data || response || null;
const emailWasSent = value => ['SENT', 'ACCEPTED', 'DELIVERED', 'MANUALLY_SENT'].includes(normalizeStatus(value));

const withTimeout = (promise, ms, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)} seconds.`)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
};

const money = (value, currency = 'USD') => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: text(currency || 'USD').toUpperCase() }).format(num(value, 0));
  } catch {
    return `$${num(value, 0).toFixed(2)}`;
  }
};

const extractSegments = booking => {
  if (!booking) return [];
  const direct = booking.itinerary_segments || booking.itinerarySegments;
  if (Array.isArray(direct) && direct.length) return direct;
  const outbound = booking.outbound_segments || booking.itinerary?.outbound || [];
  const inbound = booking.return_segments || booking.itinerary?.return || [];
  if (outbound.length || inbound.length) {
    return [
      ...outbound.map((segment, index) => ({ ...segment, journey_direction: 'outbound', segment_sequence: index + 1 })),
      ...inbound.map((segment, index) => ({ ...segment, journey_direction: 'return', segment_sequence: index + 1 }))
    ];
  }
  return (booking.flights || []).map((flight, index) => ({
    ...flight,
    journey_direction: ['return', 'inbound'].includes(text(flight.leg || flight.direction).toLowerCase()) ? 'return' : 'outbound',
    segment_sequence: index + 1
  }));
};

const normalizeSegment = (segment = {}, index = 0) => {
  const rawDirection = text(segment.journey_direction || segment.direction || segment.leg || 'outbound').toLowerCase();
  const direction = ['return', 'inbound'].includes(rawDirection) ? 'return' : 'outbound';
  return {
    ...segment,
    _key: segment.id || segment._key || `segment-${Date.now()}-${index}`,
    journey_direction: direction,
    direction,
    carrier_name: segment.carrier_name || segment.airline_name || segment.airlineName || segment.airline || '',
    carrier_code: text(segment.carrier_code || segment.marketing_carrier_code || segment.airlineCode).toUpperCase(),
    flight_number: text(segment.flight_number || segment.flightNumber),
    origin_airport: text(segment.origin_airport || segment.originCode || segment.departure_airport || segment.departureAirport).toUpperCase(),
    destination_airport: text(segment.destination_airport || segment.destinationCode || segment.arrival_airport || segment.arrivalAirport).toUpperCase(),
    departure_date: text(segment.departure_date || segment.departureDate).slice(0, 10),
    departure_time: text(segment.departure_time || segment.departureTime || segment.departure_time_str).slice(0, 5),
    arrival_date: text(segment.arrival_date || segment.arrivalDate || segment.departure_date || segment.departureDate).slice(0, 10),
    arrival_time: text(segment.arrival_time || segment.arrivalTime || segment.arrival_time_str).slice(0, 5),
    cabin: segment.cabin || segment.cabin_class || segment.cabinClass || 'Economy'
  };
};

const buildEmailInfo = (booking, type) => {
  if (!booking) return { status: 'NOT_SENT', recipient: '', providerId: null, sentAt: null, error: null };
  if (type === 'booking_request') {
    const activity = booking.emailActivity?.bookingRequest || {};
    return {
      status: activity.status || booking.booking_request_email_status || 'NOT_SENT',
      recipient: activity.recipient || booking.booking_request_email_recipient || booking.email || '',
      providerId: activity.providerMessageId || booking.booking_request_email_id || null,
      sentAt: activity.sentAt || booking.booking_request_email_sent_at || null,
      error: activity.error || booking.booking_request_email_error || null
    };
  }
  if (type === 'authorization') {
    const activity = booking.emailActivity?.authorization || {};
    return {
      status: activity.status || booking.authorization_email_status || 'NOT_SENT',
      recipient: activity.recipient || booking.authorization_email_recipient || booking.email || '',
      providerId: activity.providerMessageId || booking.authorization_email_id || null,
      sentAt: activity.sentAt || booking.authorization_email_sent_at || null,
      error: activity.error || booking.authorization_email_error || null
    };
  }
  const activity = booking.emailActivity?.finalTicket || {};
  return {
    status: activity.status || booking.final_confirmation_email_status || 'NOT_SENT',
    recipient: activity.recipient || booking.final_confirmation_email_recipient || booking.email || '',
    providerId: activity.providerMessageId || booking.final_confirmation_email_id || null,
    sentAt: activity.sentAt || booking.final_confirmation_email_sent_at || null,
    error: activity.error || booking.final_confirmation_email_error || null
  };
};

function SectionMessage({ state }) {
  if (!state?.message) return null;
  return <div className={`abm-message abm-message--${state.type || 'info'}`}>{state.message}</div>;
}

export default function AdminBookingManagementPanel() {
  const { code } = useParams();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState({});
  const [messages, setMessages] = useState({});
  const [gdsOpen, setGdsOpen] = useState(false);
  const [previewModal, setPreviewModal] = useState({ open: false, type: 'booking_request' });

  const [statusForm, setStatusForm] = useState({ status: 'PENDING', notes: '' });
  const [segments, setSegments] = useState([]);
  const [pricingForm, setPricingForm] = useState({ supplierFare: '0.00', taxes: '0.00', customerTotal: '0.00', currency: 'USD', reason: '' });
  const [authForm, setAuthForm] = useState({ authorizedAmount: '0.00', currency: 'USD' });
  const [paymentForm, setPaymentForm] = useState({ paymentStatus: 'PENDING', referenceId: '' });
  const [paymentSplits, setPaymentSplits] = useState([]);
  const [billingForm, setBillingForm] = useState({
    cardholderName: '', cardBrand: '', cardLast4: '', cardExpMonth: '', cardExpYear: '',
    billingEmail: '', billingPhone: '', addressLine1: '', addressLine2: '', city: '', stateProvince: '', postalCode: '', country: 'United States'
  });
  const [ticketForm, setTicketForm] = useState({
    airlineName: '', airlineCode: '', airlineLogoUrl: '', airlineConfirmationNumber: '', ticketNumber: '',
    ticketIssuedAt: '', supplierConfirmation: '', ticketNotes: ''
  });

  const setMessage = (section, type, message) => setMessages(current => ({ ...current, [section]: { type, message } }));
  const setBusyFlag = (section, value) => setBusy(current => ({ ...current, [section]: value }));

  const hydrate = useCallback(next => {
    if (!next) return;
    setBooking(next);
    setStatusForm({ status: normalizeStatus(next.status || next.bookingStatus), notes: next.internal_notes || next.internalNotes || '' });
    setSegments(extractSegments(next).map(normalizeSegment));

    const customerTotal = num(next.pricing?.customerTotal ?? next.customer_price ?? next.total_amount, 0);
    const supplierFare = num(next.pricing?.supplierCost ?? next.pricing?.supplierFare ?? next.supplier_fare ?? next.supplier_price ?? next.original_api_price, customerTotal);
    const taxes = num(next.pricing?.taxes ?? next.taxes_and_fees ?? next.taxes, 0);
    setPricingForm({ supplierFare: supplierFare.toFixed(2), taxes: taxes.toFixed(2), customerTotal: customerTotal.toFixed(2), currency: next.currency || next.pricing?.currency || 'USD', reason: '' });

    const authorized = num(next.authorized_amount ?? next.authorization?.authorizedAmount ?? customerTotal, customerTotal);
    setAuthForm({ authorizedAmount: authorized.toFixed(2), currency: next.currency || 'USD' });
    setPaymentForm({
      paymentStatus: normalizeStatus(next.payment_status || next.payment?.status || 'PENDING'),
      referenceId: next.transaction_reference || next.transactionReference || next.payment_reference_id || next.payment?.referenceId || ''
    });
    setPaymentSplits((next.payment_splits || next.paymentSplits || []).map((split, index) => ({
      _key: split.id || `split-${Date.now()}-${index}`,
      merchantName: split.merchant_name || split.merchantName || '',
      amount: text(split.amount)
    })));

    const bd = next.billingDetails || next.cardReference || next.paymentMethod || {};
    setBillingForm({
      cardholderName: bd.cardholderName || bd.cardholder_name || next.passenger_name || '',
      cardBrand: bd.cardBrand || bd.card_brand || '',
      cardLast4: bd.cardLast4 || bd.card_last4 || bd.last4 || '',
      cardExpMonth: text(bd.cardExpMonth || bd.card_exp_month || bd.expMonth),
      cardExpYear: text(bd.cardExpYear || bd.card_exp_year || bd.expYear),
      billingEmail: bd.billingEmail || bd.billing_email || next.email || '',
      billingPhone: bd.billingPhone || bd.billing_phone || next.phone || '',
      addressLine1: bd.addressLine1 || bd.billing_address_line1 || '',
      addressLine2: bd.addressLine2 || bd.billing_address_line2 || '',
      city: bd.city || bd.billing_city || '',
      stateProvince: bd.stateProvince || bd.billing_state || '',
      postalCode: bd.postalCode || bd.billing_postal_code || '',
      country: bd.country || bd.billing_country || 'United States'
    });
    setTicketForm({
      airlineName: next.airline_name || next.airlineName || next.carrier || '',
      airlineCode: next.airline_code || next.airlineCode || '',
      airlineLogoUrl: next.airline_logo_url || next.airlineLogoUrl || '',
      airlineConfirmationNumber: next.airline_confirmation_number || next.airlineConfirmationNumber || next.airline_pnr || next.pnr || '',
      ticketNumber: next.ticket_number || next.ticketNumber || '',
      ticketIssuedAt: text(next.ticket_issued_at || next.ticketIssuedAt).slice(0, 10),
      supplierConfirmation: next.supplier_confirmation || next.supplierConfirmation || '',
      ticketNotes: next.ticket_notes || next.ticketNotes || ''
    });
  }, []);

  const load = useCallback(async () => {
    if (!code) return null;
    setLoading(true);
    setLoadError('');
    try {
      const response = await withTimeout(adminAPI.getBookingById(code), 15000, 'Booking management details');
      const next = unwrapBooking(response);
      if (!next?.id) throw new Error('Booking details could not be loaded.');
      hydrate(next);
      return next;
    } catch (error) {
      setLoadError(getApiErrorMessage(error, 'Unable to load booking management controls.'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [code, hydrate]);

  useEffect(() => { load(); }, [load]);

  const saveAndRefresh = async (section, factory, successMessage) => {
    if (!booking?.id || busy[section]) return null;
    setBusyFlag(section, true);
    setMessage(section, 'info', 'Saving…');
    try {
      const response = await withTimeout(Promise.resolve().then(factory), 25000, successMessage || 'Save');
      if (response?.success === false) throw new Error(response?.error?.message || 'The server rejected the update.');
      const responseBooking = unwrapBooking(response);
      if (responseBooking?.id) hydrate(responseBooking);
      else await load();
      setMessage(section, 'success', response?.message || successMessage || 'Saved successfully.');
      return response;
    } catch (error) {
      setMessage(section, 'error', getApiErrorMessage(error, 'Unable to save changes.'));
      return null;
    } finally {
      setBusyFlag(section, false);
    }
  };

  const saveStatus = () => saveAndRefresh('status', () => adminAPI.patchStatusNotes(booking.id, {
    newStatus: statusForm.status,
    internalNotes: statusForm.notes
  }), 'Status & notes saved.');

  const canonicalSegments = input => input.map((segment, index) => {
    const direction = segment.journey_direction === 'return' ? 'return' : 'outbound';
    const sequence = input.slice(0, index + 1).filter(item => (item.journey_direction === 'return' ? 'return' : 'outbound') === direction).length;
    return {
      ...segment,
      journey_direction: direction,
      direction,
      segment_sequence: sequence,
      origin_airport: text(segment.origin_airport).toUpperCase(),
      destination_airport: text(segment.destination_airport).toUpperCase(),
      carrier_code: text(segment.carrier_code).toUpperCase()
    };
  });

  const persistItinerary = async sourceSegments => {
    const finalSegments = canonicalSegments(sourceSegments);
    if (!finalSegments.length) {
      setMessage('itinerary', 'error', 'Add or import at least one flight before saving.');
      return null;
    }
    if (finalSegments.some(segment => !/^[A-Z]{3}$/.test(segment.origin_airport) || !/^[A-Z]{3}$/.test(segment.destination_airport))) {
      setMessage('itinerary', 'error', 'Every flight needs valid 3-letter origin and destination airport codes.');
      return null;
    }
    return saveAndRefresh('itinerary', () => adminAPI.patchItinerary(booking.id, {
      segments: finalSegments,
      expectedVersion: booking.updated_at || booking.version
    }), 'Itinerary saved.');
  };

  const applyImportedItinerary = async ({ segments: importedSegments }) => {
    const normalized = (importedSegments || []).map(normalizeSegment);
    setSegments(normalized);
    const result = await persistItinerary(normalized);
    if (!result) throw new Error('The imported itinerary could not be saved.');
    return result;
  };

  const savePricing = () => {
    const supplierFare = num(pricingForm.supplierFare, NaN);
    const taxes = num(pricingForm.taxes, NaN);
    const customerTotal = num(pricingForm.customerTotal, NaN);
    if (!Number.isFinite(supplierFare) || supplierFare < 0 || !Number.isFinite(taxes) || taxes < 0 || !Number.isFinite(customerTotal) || customerTotal <= 0) {
      setMessage('pricing', 'error', 'Enter valid pricing values. Customer total must be greater than zero.');
      return;
    }
    if (!pricingForm.reason.trim()) {
      setMessage('pricing', 'error', 'A reason is required for every pricing change.');
      return;
    }
    saveAndRefresh('pricing', () => adminAPI.patchPricing(booking.id, {
      supplierFare,
      taxesAndFees: taxes,
      customerTotal,
      currency: pricingForm.currency || 'USD',
      reason: pricingForm.reason.trim(),
      bookingVersion: booking.updated_at
    }), 'Pricing saved.');
  };

  const saveAuthorization = () => {
    const amount = num(authForm.authorizedAmount, NaN);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage('authorization', 'error', 'Authorized amount must be greater than zero.');
      return;
    }
    saveAndRefresh('authorization', () => adminAPI.patchAuthorizationSettings(booking.id, {
      authorizedAmount: amount,
      currency: authForm.currency || 'USD'
    }), 'Authorization settings saved.');
  };

  const savePayment = () => {
    if (!paymentSplits.length) {
      setMessage('payment', 'error', 'Add at least one payment split.');
      return;
    }
    const splits = paymentSplits.map(split => ({ merchantName: split.merchantName.trim(), amount: num(split.amount, NaN) }));
    if (splits.some(split => !split.merchantName || !Number.isFinite(split.amount) || split.amount <= 0)) {
      setMessage('payment', 'error', 'Every split needs a merchant name and amount greater than zero.');
      return;
    }
    const splitTotal = splits.reduce((sum, split) => sum + Math.round(split.amount * 100), 0) / 100;
    const bookingTotal = num(pricingForm.customerTotal, 0);
    if (Math.abs(splitTotal - bookingTotal) > 0.001) {
      setMessage('payment', 'error', `Payment splits total ${money(splitTotal)} but booking total is ${money(bookingTotal)}.`);
      return;
    }
    if (paymentForm.paymentStatus === 'PAID' && !paymentForm.referenceId.trim()) {
      setMessage('payment', 'error', 'Transaction/reference ID is required before marking payment PAID.');
      return;
    }
    saveAndRefresh('payment', () => adminAPI.patchPaymentAuthorization(booking.id, {
      splits,
      paymentState: paymentForm.paymentStatus,
      referenceId: paymentForm.referenceId.trim() || null,
      paidAmount: paymentForm.paymentStatus === 'PAID' ? bookingTotal : null,
      bookingVersion: booking.updated_at,
      reason: 'Admin booking detail payment update'
    }), 'Payment saved.');
  };

  const saveBilling = () => {
    const last4 = text(billingForm.cardLast4).replace(/\D/g, '');
    if (last4 && !/^\d{4}$/.test(last4)) {
      setMessage('billing', 'error', 'Card last 4 must be exactly four digits.');
      return;
    }
    saveAndRefresh('billing', () => adminAPI.patchBillingDetails(booking.id, {
      billingDetails: {
        ...billingForm,
        cardLast4: last4 || undefined,
        cardExpMonth: billingForm.cardExpMonth ? Number(billingForm.cardExpMonth) : undefined,
        cardExpYear: billingForm.cardExpYear ? Number(billingForm.cardExpYear) : undefined
      }
    }), 'Billing details saved.');
  };

  const saveTicket = () => {
    const pnr = text(ticketForm.airlineConfirmationNumber).trim().toUpperCase();
    if (pnr && !/^[A-Z0-9]{6}$/.test(pnr)) {
      setMessage('ticket', 'error', 'PNR must contain exactly 6 letters or numbers.');
      return;
    }
    const ticketNumber = text(ticketForm.ticketNumber).replace(/\D/g, '');
    if (ticketNumber && !/^\d{1,13}$/.test(ticketNumber)) {
      setMessage('ticket', 'error', 'Ticket number must contain 1–13 digits.');
      return;
    }
    saveAndRefresh('ticket', () => adminAPI.patchAirlineDetails(booking.id, {
      airlineName: ticketForm.airlineName.trim(),
      airlineCode: ticketForm.airlineCode.trim().toUpperCase(),
      airlineLogoUrl: ticketForm.airlineLogoUrl,
      airlineConfirmationNumber: pnr,
      airlinePnr: pnr,
      ticketNumber,
      ticketIssuedAt: ticketForm.ticketIssuedAt || null,
      ticketIssueDate: ticketForm.ticketIssuedAt || null,
      supplierConfirmation: ticketForm.supplierConfirmation.trim(),
      ticketNotes: ticketForm.ticketNotes
    }), 'Airline ticket details saved.');
  };

  const emailInfo = useMemo(() => ({
    booking_request: buildEmailInfo(booking, 'booking_request'),
    authorization: buildEmailInfo(booking, 'authorization'),
    final_ticket: buildEmailInfo(booking, 'final_ticket')
  }), [booking]);

  const sendEmail = async type => {
    if (!booking?.id) return;
    const info = emailInfo[type];
    const resend = emailWasSent(info.status);
    const action = type === 'booking_request'
      ? (resend ? 'resend_booking_request_email' : 'send_booking_request_email')
      : type === 'authorization'
        ? (resend ? 'resend_authorization' : 'send_authorization')
        : (resend ? 'resend_final_ticket_email' : 'send_final_ticket_email');

    if (type === 'final_ticket') {
      const pnr = text(booking.airline_confirmation_number || booking.airlineConfirmationNumber || booking.airline_pnr || booking.pnr).trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(pnr)) {
        setMessage('emails', 'error', 'Save a valid 6-character PNR before sending the final ticket email.');
        return;
      }
      if (!extractSegments(booking).length) {
        setMessage('emails', 'error', 'Save an itinerary before sending the final ticket email.');
        return;
      }
    }

    const key = `email-${type}`;
    setBusyFlag(key, true);
    setMessage('emails', 'info', `Sending ${type.replaceAll('_', ' ')} email…`);
    try {
      const clientRequestId = window.crypto?.randomUUID?.() || `email-${Date.now()}`;
      const response = await withTimeout(adminAPI.sendEmailAction(booking.id, action, { clientRequestId }), 35000, 'Email delivery');
      if (response?.success === false) throw new Error(response?.error?.message || 'Email dispatch failed.');
      setMessage('emails', 'success', response?.message || 'Email sent successfully.');
      await load();
    } catch (error) {
      setMessage('emails', 'error', getApiErrorMessage(error, 'Email dispatch failed.'));
    } finally {
      setBusyFlag(key, false);
    }
  };

  const downloadAuthorizationPdf = async () => {
    if (!booking?.id) return;
    setBusyFlag('pdf', true);
    setMessage('emails', 'info', 'Generating authorization evidence PDF…');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/bookings/${booking.id}/authorization-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error?.message || `PDF request failed with HTTP ${response.status}.`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `authorization-${booking.confirmation_code || code}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage('emails', 'success', 'Authorization evidence PDF downloaded.');
    } catch (error) {
      setMessage('emails', 'error', error?.name === 'AbortError' ? 'PDF generation timed out.' : getApiErrorMessage(error, 'Unable to generate PDF.'));
    } finally {
      clearTimeout(timer);
      setBusyFlag('pdf', false);
    }
  };

  const updateSegment = (index, field, value) => setSegments(current => current.map((segment, idx) => idx === index ? { ...segment, [field]: value } : segment));
  const removeSegment = index => setSegments(current => current.filter((_, idx) => idx !== index));
  const addSegment = () => setSegments(current => [...current, normalizeSegment({ journey_direction: 'outbound', cabin: 'Economy' }, current.length)]);

  if (loading) return <section className="abm-panel abm-loading">Loading booking management controls…</section>;
  if (loadError) return <section className="abm-panel"><div className="abm-message abm-message--error">{loadError}</div><button className="abm-button" type="button" onClick={load}>Retry</button></section>;
  if (!booking?.id) return null;

  return (
    <section className="abm-panel" aria-label="Booking management">
      <div className="abm-heading">
        <div><span>Booking Management</span><h2>Edit Booking</h2><p>Manage workflow, itinerary, pricing, authorization, payment, ticketing and email actions for this reservation.</p></div>
        <button className="abm-button abm-button--secondary" type="button" onClick={load}>Refresh Details</button>
      </div>

      <div className="abm-status-strip">
        <div><span>Booking</span><strong>{normalizeStatus(booking.status)}</strong></div>
        <div><span>Authorization</span><strong>{normalizeStatus(booking.authorization_status || booking.authorization?.status || 'PENDING')}</strong></div>
        <div><span>Payment</span><strong>{normalizeStatus(booking.payment_status || booking.payment?.status || 'PENDING')}</strong></div>
        <div><span>Customer Total</span><strong>{money(pricingForm.customerTotal, pricingForm.currency)}</strong></div>
      </div>

      <details className="abm-section" open>
        <summary><strong>1. Status & Internal Notes</strong><span>Workflow state and staff notes</span></summary>
        <div className="abm-body abm-grid abm-grid--2">
          <label><span>Booking status</span><select value={statusForm.status} onChange={event => setStatusForm(current => ({ ...current, status: event.target.value }))}>{['DRAFT','PENDING','AWAITING_AUTHORIZATION','AUTHORIZED','REAUTHORIZATION_REQUIRED','READY_FOR_TICKETING','TICKETED','DONE','CANCELLED','FAILED'].map(status => <option key={status}>{status}</option>)}</select></label>
          <label><span>Internal notes</span><textarea value={statusForm.notes} onChange={event => setStatusForm(current => ({ ...current, notes: event.target.value }))} /></label>
          <SectionMessage state={messages.status} />
        </div>
        <div className="abm-footer"><button className="abm-button" type="button" onClick={saveStatus} disabled={busy.status}>{busy.status ? 'Saving…' : 'Save Status & Notes'}</button></div>
      </details>

      <details className="abm-section" open>
        <summary><strong>2. Flight Itinerary</strong><span>Import, add, edit or remove flight segments</span></summary>
        <div className="abm-toolbar">
          <button className="abm-button" type="button" onClick={() => setGdsOpen(true)}>Import GDS / JSON</button>
          <button className="abm-button abm-button--secondary" type="button" onClick={addSegment}>+ Add Flight Manually</button>
          <button className="abm-button abm-button--danger" type="button" onClick={() => {
            if (!window.confirm('Clear every saved flight segment from this booking?')) return;
            saveAndRefresh('itinerary', () => adminAPI.patchItinerary(booking.id, { clear: true }), 'Itinerary cleared.').then(result => { if (result) setSegments([]); });
          }} disabled={busy.itinerary || !segments.length}>Clear Itinerary</button>
        </div>
        <div className="abm-body">
          {!segments.length ? <div className="abm-empty">No itinerary saved. Import GDS/JSON or add a flight manually.</div> : segments.map((segment, index) => (
            <details className="abm-flight" open={index === 0} key={segment._key || index}>
              <summary><strong>Flight {index + 1}: {segment.origin_airport || '---'} → {segment.destination_airport || '---'}</strong><span>{segment.carrier_code} {segment.flight_number}</span></summary>
              <div className="abm-grid abm-grid--4">
                <label><span>Direction</span><select value={segment.journey_direction || 'outbound'} onChange={event => updateSegment(index, 'journey_direction', event.target.value)}><option value="outbound">Outbound</option><option value="return">Return</option></select></label>
                <label><span>Airline</span><input value={segment.carrier_name || ''} onChange={event => updateSegment(index, 'carrier_name', event.target.value)} /></label>
                <label><span>Carrier code</span><input maxLength={3} value={segment.carrier_code || ''} onChange={event => updateSegment(index, 'carrier_code', event.target.value.toUpperCase())} /></label>
                <label><span>Flight #</span><input value={segment.flight_number || ''} onChange={event => updateSegment(index, 'flight_number', event.target.value)} /></label>
                <label><span>Origin</span><input maxLength={3} value={segment.origin_airport || ''} onChange={event => updateSegment(index, 'origin_airport', event.target.value.toUpperCase())} /></label>
                <label><span>Destination</span><input maxLength={3} value={segment.destination_airport || ''} onChange={event => updateSegment(index, 'destination_airport', event.target.value.toUpperCase())} /></label>
                <label><span>Departure date</span><input type="date" value={segment.departure_date || ''} onChange={event => updateSegment(index, 'departure_date', event.target.value)} /></label>
                <label><span>Departure time</span><input type="time" value={segment.departure_time || ''} onChange={event => updateSegment(index, 'departure_time', event.target.value)} /></label>
                <label><span>Arrival date</span><input type="date" value={segment.arrival_date || ''} onChange={event => updateSegment(index, 'arrival_date', event.target.value)} /></label>
                <label><span>Arrival time</span><input type="time" value={segment.arrival_time || ''} onChange={event => updateSegment(index, 'arrival_time', event.target.value)} /></label>
                <label><span>Cabin</span><select value={segment.cabin || 'Economy'} onChange={event => updateSegment(index, 'cabin', event.target.value)}><option>Economy</option><option>Premium Economy</option><option>Business</option><option>First</option></select></label>
                <div className="abm-remove-cell"><button className="abm-button abm-button--danger" type="button" onClick={() => removeSegment(index)}>Remove Flight</button></div>
              </div>
            </details>
          ))}
          <SectionMessage state={messages.itinerary} />
        </div>
        <div className="abm-footer"><button className="abm-button" type="button" onClick={() => persistItinerary(segments)} disabled={busy.itinerary || !segments.length}>{busy.itinerary ? 'Saving & verifying…' : 'Save Itinerary'}</button></div>
      </details>

      <div className="abm-two-column">
        <details className="abm-section" open>
          <summary><strong>3. Pricing</strong><span>Supplier cost and customer total</span></summary>
          <div className="abm-body abm-grid abm-grid--2">
            <label><span>Supplier fare</span><input inputMode="decimal" value={pricingForm.supplierFare} onChange={event => setPricingForm(current => ({ ...current, supplierFare: event.target.value }))} /></label>
            <label><span>Taxes & fees</span><input inputMode="decimal" value={pricingForm.taxes} onChange={event => setPricingForm(current => ({ ...current, taxes: event.target.value }))} /></label>
            <label><span>Customer total</span><input inputMode="decimal" value={pricingForm.customerTotal} onChange={event => setPricingForm(current => ({ ...current, customerTotal: event.target.value }))} /></label>
            <label><span>Currency</span><input maxLength={3} value={pricingForm.currency} onChange={event => setPricingForm(current => ({ ...current, currency: event.target.value.toUpperCase() }))} /></label>
            <label className="abm-span-2"><span>Reason for pricing revision *</span><input value={pricingForm.reason} onChange={event => setPricingForm(current => ({ ...current, reason: event.target.value }))} placeholder="Required audit reason" /></label>
            <SectionMessage state={messages.pricing} />
          </div>
          <div className="abm-footer"><button className="abm-button" type="button" onClick={savePricing} disabled={busy.pricing}>{busy.pricing ? 'Saving…' : 'Save Pricing'}</button></div>
        </details>

        <details className="abm-section" open>
          <summary><strong>4. Passenger Authorization</strong><span>Amount the passenger authorizes</span></summary>
          <div className="abm-body abm-grid abm-grid--2">
            <label><span>Authorized amount</span><input inputMode="decimal" value={authForm.authorizedAmount} onChange={event => setAuthForm(current => ({ ...current, authorizedAmount: event.target.value }))} /></label>
            <label><span>Currency</span><input maxLength={3} value={authForm.currency} onChange={event => setAuthForm(current => ({ ...current, currency: event.target.value.toUpperCase() }))} /></label>
            <SectionMessage state={messages.authorization} />
          </div>
          <div className="abm-footer"><button className="abm-button" type="button" onClick={saveAuthorization} disabled={busy.authorization}>{busy.authorization ? 'Saving…' : 'Save Authorization Settings'}</button></div>
        </details>
      </div>

      <details className="abm-section" open>
        <summary><strong>5. Payment & Splits</strong><span>Payment state, transaction reference and merchant split amounts</span></summary>
        <div className="abm-toolbar"><button className="abm-button abm-button--secondary" type="button" onClick={() => setPaymentSplits(current => [...current, { _key: `split-${Date.now()}`, merchantName: 'FareTransit LLC', amount: '0.00' }])}>+ Add Payment Split</button></div>
        <div className="abm-body">
          <div className="abm-grid abm-grid--2">
            <label><span>Payment status</span><select value={paymentForm.paymentStatus} onChange={event => setPaymentForm(current => ({ ...current, paymentStatus: event.target.value }))}>{['PENDING','PROCESSING','PAID','FAILED','REFUNDED'].map(status => <option key={status}>{status}</option>)}</select></label>
            <label><span>Transaction / reference ID</span><input value={paymentForm.referenceId} onChange={event => setPaymentForm(current => ({ ...current, referenceId: event.target.value }))} /></label>
          </div>
          {paymentSplits.map((split, index) => <div className="abm-split-row" key={split._key || index}><label><span>Merchant</span><input value={split.merchantName} onChange={event => setPaymentSplits(current => current.map((item, idx) => idx === index ? { ...item, merchantName: event.target.value } : item))} /></label><label><span>Amount</span><input inputMode="decimal" value={split.amount} onChange={event => setPaymentSplits(current => current.map((item, idx) => idx === index ? { ...item, amount: event.target.value } : item))} /></label><button className="abm-button abm-button--danger" type="button" onClick={() => setPaymentSplits(current => current.filter((_, idx) => idx !== index))}>Remove</button></div>)}
          <div className="abm-note">Split total: {money(paymentSplits.reduce((sum, split) => sum + num(split.amount, 0), 0))} · Booking total: {money(pricingForm.customerTotal)}</div>
          <SectionMessage state={messages.payment} />
        </div>
        <div className="abm-footer"><button className="abm-button" type="button" onClick={savePayment} disabled={busy.payment}>{busy.payment ? 'Saving & verifying…' : 'Save Payment'}</button></div>
      </details>

      <details className="abm-section">
        <summary><strong>6. Billing & Card Reference</strong><span>Safe card metadata only — never full card number or CVV</span></summary>
        <div className="abm-body abm-grid abm-grid--4">
          <label><span>Cardholder</span><input value={billingForm.cardholderName} onChange={event => setBillingForm(current => ({ ...current, cardholderName: event.target.value }))} /></label>
          <label><span>Brand</span><select value={billingForm.cardBrand} onChange={event => setBillingForm(current => ({ ...current, cardBrand: event.target.value }))}><option value="">Select</option><option>Visa</option><option>Mastercard</option><option>Amex</option><option>Discover</option></select></label>
          <label><span>Last 4</span><input maxLength={4} inputMode="numeric" value={billingForm.cardLast4} onChange={event => setBillingForm(current => ({ ...current, cardLast4: event.target.value.replace(/\D/g, '').slice(0, 4) }))} /></label>
          <label><span>Expiry month</span><input maxLength={2} inputMode="numeric" value={billingForm.cardExpMonth} onChange={event => setBillingForm(current => ({ ...current, cardExpMonth: event.target.value.replace(/\D/g, '').slice(0, 2) }))} /></label>
          <label><span>Expiry year</span><input maxLength={4} inputMode="numeric" value={billingForm.cardExpYear} onChange={event => setBillingForm(current => ({ ...current, cardExpYear: event.target.value.replace(/\D/g, '').slice(0, 4) }))} /></label>
          <label><span>Billing email</span><input value={billingForm.billingEmail} onChange={event => setBillingForm(current => ({ ...current, billingEmail: event.target.value }))} /></label>
          <label><span>Billing phone</span><input value={billingForm.billingPhone} onChange={event => setBillingForm(current => ({ ...current, billingPhone: event.target.value }))} /></label>
          <label><span>Address line 1</span><input value={billingForm.addressLine1} onChange={event => setBillingForm(current => ({ ...current, addressLine1: event.target.value }))} /></label>
          <label><span>Address line 2</span><input value={billingForm.addressLine2} onChange={event => setBillingForm(current => ({ ...current, addressLine2: event.target.value }))} /></label>
          <label><span>City</span><input value={billingForm.city} onChange={event => setBillingForm(current => ({ ...current, city: event.target.value }))} /></label>
          <label><span>State</span><input value={billingForm.stateProvince} onChange={event => setBillingForm(current => ({ ...current, stateProvince: event.target.value }))} /></label>
          <label><span>Postal code</span><input value={billingForm.postalCode} onChange={event => setBillingForm(current => ({ ...current, postalCode: event.target.value }))} /></label>
          <label><span>Country</span><input value={billingForm.country} onChange={event => setBillingForm(current => ({ ...current, country: event.target.value }))} /></label>
          <SectionMessage state={messages.billing} />
        </div>
        <div className="abm-footer"><button className="abm-button" type="button" onClick={saveBilling} disabled={busy.billing}>{busy.billing ? 'Saving & verifying…' : 'Save Billing Details'}</button></div>
      </details>

      <details className="abm-section" open>
        <summary><strong>7. Airline Ticket / PNR</strong><span>Carrier confirmation and ticket details</span></summary>
        <div className="abm-body abm-grid abm-grid--4">
          <label><span>Airline name</span><input value={ticketForm.airlineName} onChange={event => setTicketForm(current => ({ ...current, airlineName: event.target.value }))} /></label>
          <label><span>Airline code</span><input maxLength={3} value={ticketForm.airlineCode} onChange={event => setTicketForm(current => ({ ...current, airlineCode: event.target.value.toUpperCase() }))} /></label>
          <label><span>PNR (6 chars)</span><input maxLength={6} value={ticketForm.airlineConfirmationNumber} onChange={event => setTicketForm(current => ({ ...current, airlineConfirmationNumber: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) }))} /></label>
          <label><span>Ticket number</span><input maxLength={13} inputMode="numeric" value={ticketForm.ticketNumber} onChange={event => setTicketForm(current => ({ ...current, ticketNumber: event.target.value.replace(/\D/g, '').slice(0, 13) }))} /></label>
          <label><span>Ticket issue date</span><input type="date" value={ticketForm.ticketIssuedAt} onChange={event => setTicketForm(current => ({ ...current, ticketIssuedAt: event.target.value }))} /></label>
          <label><span>Supplier confirmation</span><input value={ticketForm.supplierConfirmation} onChange={event => setTicketForm(current => ({ ...current, supplierConfirmation: event.target.value }))} /></label>
          <label className="abm-span-2"><span>Ticket notes</span><textarea value={ticketForm.ticketNotes} onChange={event => setTicketForm(current => ({ ...current, ticketNotes: event.target.value }))} /></label>
          <SectionMessage state={messages.ticket} />
        </div>
        <div className="abm-footer"><button className="abm-button" type="button" onClick={saveTicket} disabled={busy.ticket}>{busy.ticket ? 'Saving…' : 'Save Ticket Details'}</button></div>
      </details>

      <details className="abm-section" open>
        <summary><strong>8. Email & Authorization Actions</strong><span>Send/resend booking, authorization and final ticket messages</span></summary>
        <div className="abm-body">
          <div className="abm-email-grid">
            {[
              ['booking_request', 'Booking Confirmation'],
              ['authorization', 'Authorization'],
              ['final_ticket', 'Final Ticket']
            ].map(([type, title]) => {
              const info = emailInfo[type];
              const key = `email-${type}`;
              return <div className="abm-email-card" key={type}><div><strong>{title}</strong><span className={`abm-email-status abm-email-status--${normalizeStatus(info.status).toLowerCase()}`}>{normalizeStatus(info.status)}</span></div><small>{info.recipient || booking.email || 'No recipient'}</small><small>{info.sentAt ? `Last sent: ${new Date(info.sentAt).toLocaleString()}` : 'Not sent yet'}</small>{info.error && <small className="abm-inline-error">{info.error}</small>}<div><button className="abm-button abm-button--secondary" type="button" onClick={() => setPreviewModal({ open: true, type })}>Preview</button><button className="abm-button" type="button" onClick={() => sendEmail(type)} disabled={busy[key]}>{busy[key] ? 'Sending…' : (emailWasSent(info.status) ? 'Resend' : 'Send')}</button></div></div>;
            })}
          </div>
          <div className="abm-toolbar"><button className="abm-button abm-button--secondary" type="button" onClick={downloadAuthorizationPdf} disabled={busy.pdf}>{busy.pdf ? 'Generating PDF…' : 'Download Authorization Evidence PDF'}</button></div>
          <SectionMessage state={messages.emails} />
        </div>
      </details>

      <AdminGdsImportModalV2 isOpen={gdsOpen} onClose={() => setGdsOpen(false)} onApply={applyImportedItinerary} />
      {previewModal.open && <AdminEmailPreviewModal isOpen={previewModal.open} onClose={() => setPreviewModal({ open: false, type: 'booking_request' })} bookingId={booking.id} emailType={previewModal.type} onMarkManuallySentSuccess={load} />}
    </section>
  );
}
