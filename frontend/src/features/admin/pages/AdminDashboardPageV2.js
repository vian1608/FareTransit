import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { adminAPI } from '../../../shared/api/api';
import AdminEmailPreviewModal from '../../../shared/components/admin/AdminEmailPreviewModal';
import BookingBackupImportModal from '../components/BookingBackupImportModal';
import AdminGdsImportModalV2 from '../components/AdminGdsImportModalV2';
import './AdminDashboardPageV2.css';

const PAGE_SIZE = 25;

const withTimeout = (promise, ms, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} timed out after ${Math.round(ms / 1000)} seconds.`);
      error.code = 'UI_TIMEOUT';
      reject(error);
    }, ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
};

const errorMessage = (error, fallback = 'The request failed.') => {
  const apiError = error?.response?.data?.error;
  if (apiError?.code && apiError?.message) return `${apiError.code}: ${apiError.message}`;
  if (apiError?.message) return apiError.message;
  if (typeof error?.response?.data?.message === 'string') return error.response.data.message;
  if (typeof error?.message === 'string') return error.message;
  return fallback;
};

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const money = (value, currency = 'USD') => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: String(currency || 'USD').toUpperCase()
    }).format(num(value, 0));
  } catch {
    return `$${num(value, 0).toFixed(2)}`;
  }
};

const normalizeStatus = value => String(value || 'PENDING').toUpperCase();
const emailWasSent = value => ['SENT', 'ACCEPTED', 'DELIVERED', 'MANUALLY_SENT'].includes(normalizeStatus(value));

const statusBadgeClass = status => {
  const value = normalizeStatus(status);
  if (['DONE', 'COMPLETED', 'TICKETED', 'AUTHORIZED', 'PAID', 'DELIVERED', 'SENT'].includes(value)) return 'adv2-badge--success';
  if (['FAILED', 'CANCELLED', 'CANCELED', 'REFUNDED'].includes(value)) return 'adv2-badge--danger';
  if (['PENDING', 'AWAITING_AUTHORIZATION', 'AWAITING_PASSENGER', 'REAUTHORIZATION_REQUIRED', 'PROCESSING'].includes(value)) return 'adv2-badge--warning';
  return 'adv2-badge--info';
};

const unwrapBooking = response => response?.booking || response?.data?.booking || response?.data || response || null;

const extractSegments = booking => {
  if (!booking) return [];
  const direct = booking.itinerary_segments || booking.itinerarySegments;
  if (Array.isArray(direct) && direct.length > 0) return direct;

  const outbound = booking.outbound_segments || booking.itinerary?.outbound || [];
  const inbound = booking.return_segments || booking.itinerary?.return || [];
  if (outbound.length || inbound.length) {
    return [
      ...outbound.map((segment, index) => ({ ...segment, journey_direction: 'outbound', segment_sequence: index + 1 })),
      ...inbound.map((segment, index) => ({ ...segment, journey_direction: 'return', segment_sequence: index + 1 }))
    ];
  }

  const flights = booking.flights || [];
  return flights.map((flight, index) => ({
    ...flight,
    journey_direction: ['return', 'inbound'].includes(String(flight.leg || flight.direction || '').toLowerCase()) ? 'return' : 'outbound',
    segment_sequence: index + 1,
    carrier_name: flight.carrier_name || flight.airline_name || flight.airline || '',
    carrier_code: flight.carrier_code || '',
    flight_number: flight.flight_number || '',
    origin_airport: flight.origin_airport || flight.departure_airport || '',
    destination_airport: flight.destination_airport || flight.arrival_airport || '',
    departure_date: flight.departure_date || '',
    departure_time: flight.departure_time || flight.departure_time_str || '',
    arrival_date: flight.arrival_date || flight.departure_date || '',
    arrival_time: flight.arrival_time || flight.arrival_time_str || '',
    cabin: flight.cabin || flight.cabin_class || 'Economy'
  }));
};

const normalizeEditableSegment = (segment = {}, index = 0) => {
  const rawDirection = String(segment.journey_direction || segment.direction || segment.leg || 'outbound').toLowerCase();
  const direction = ['return', 'inbound'].includes(rawDirection) ? 'return' : 'outbound';
  return {
    ...segment,
    _key: segment.id || segment._key || `seg-${Date.now()}-${index}`,
    journey_direction: direction,
    direction,
    carrier_name: segment.carrier_name || segment.airline_name || segment.airlineName || segment.airline || '',
    carrier_code: String(segment.carrier_code || segment.marketing_carrier_code || segment.airlineCode || '').toUpperCase(),
    flight_number: String(segment.flight_number || segment.flightNumber || ''),
    origin_airport: String(segment.origin_airport || segment.originCode || segment.departure_airport || segment.departureAirport || '').toUpperCase(),
    destination_airport: String(segment.destination_airport || segment.destinationCode || segment.arrival_airport || segment.arrivalAirport || '').toUpperCase(),
    departure_date: segment.departure_date || segment.departureDate || '',
    departure_time: segment.departure_time || segment.departureTime || '',
    arrival_date: segment.arrival_date || segment.arrivalDate || segment.departure_date || segment.departureDate || '',
    arrival_time: segment.arrival_time || segment.arrivalTime || '',
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
  const type = state.type || 'info';
  return <div className={`adv2-alert adv2-alert--${type}`}>{state.message}</div>;
}

function AdminDashboardPageV2() {
  const navigate = useNavigate();
  const { code } = useParams();

  const [activeTab, setActiveTab] = useState('bookings');
  const [bookings, setBookings] = useState([]);
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [abandoned, setAbandoned] = useState([]);
  const [abandonedLoaded, setAbandonedLoaded] = useState(false);
  const [abandonedLoading, setAbandonedLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ totalPages: 1, totalRecords: 0 });
  const [filters, setFilters] = useState({ reference: '', name: '', email: '', status: '' });
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  const [selectedBooking, setSelectedBooking] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [editMode, setEditMode] = useState(false);

  const [statusForm, setStatusForm] = useState({ status: 'PENDING', notes: '' });
  const [segments, setSegments] = useState([]);
  const [pricingForm, setPricingForm] = useState({ supplierFare: '0.00', taxes: '0.00', customerTotal: '0.00', currency: 'USD', reason: '' });
  const [authForm, setAuthForm] = useState({ authorizedAmount: '0.00', currency: 'USD' });
  const [paymentForm, setPaymentForm] = useState({ paymentStatus: 'PENDING', referenceId: '' });
  const [paymentSplits, setPaymentSplits] = useState([]);
  const [billingForm, setBillingForm] = useState({
    cardholderName: '', cardBrand: '', cardLast4: '', cardExpMonth: '', cardExpYear: '',
    billingEmail: '', billingPhone: '', addressLine1: '', addressLine2: '', city: '',
    stateProvince: '', postalCode: '', country: 'United States', transactionReference: ''
  });
  const [ticketForm, setTicketForm] = useState({
    airlineName: '', airlineCode: '', airlineLogoUrl: '', airlineConfirmationNumber: '',
    ticketNumber: '', ticketIssuedAt: '', supplierConfirmation: '', ticketNotes: ''
  });

  const [sectionState, setSectionState] = useState({});
  const [busy, setBusy] = useState({});
  const [gdsOpen, setGdsOpen] = useState(false);
  const [previewModal, setPreviewModal] = useState({ isOpen: false, emailType: 'booking_request' });
  const [backupImportOpen, setBackupImportOpen] = useState(false);

  const [deleteModal, setDeleteModal] = useState({ open: false, ids: [] });
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleteResult, setDeleteResult] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const hasAuth = () => Boolean(localStorage.getItem('token') && sessionStorage.getItem('adminSession'));

  useEffect(() => {
    if (!hasAuth()) navigate('/admin/login', { replace: true });
  }, [navigate]);

  const setMessage = (section, type, message) => {
    setSectionState(current => ({ ...current, [section]: { type, message } }));
  };

  const setBusyFlag = (section, value) => {
    setBusy(current => ({ ...current, [section]: value }));
  };

  const hydrateEditor = useCallback(booking => {
    if (!booking) return;
    const editableSegments = extractSegments(booking).map(normalizeEditableSegment);
    const customerTotal = num(booking.pricing?.customerTotal ?? booking.customer_price ?? booking.total_amount, 0);
    const supplierFare = num(booking.pricing?.supplierCost ?? booking.pricing?.supplierFare ?? booking.supplier_fare ?? booking.supplier_price ?? booking.original_api_price, customerTotal);
    const taxes = num(booking.pricing?.taxes ?? booking.taxes_and_fees ?? booking.taxes ?? 0, 0);
    const authorized = num(booking.authorized_amount ?? booking.authorization?.authorizedAmount ?? customerTotal, customerTotal);
    const bd = booking.billingDetails || booking.cardReference || booking.paymentMethod || {};

    setStatusForm({
      status: normalizeStatus(booking.status || booking.bookingStatus),
      notes: booking.internal_notes || booking.internalNotes || ''
    });
    setSegments(editableSegments);
    setPricingForm({
      supplierFare: supplierFare.toFixed(2),
      taxes: taxes.toFixed(2),
      customerTotal: customerTotal.toFixed(2),
      currency: booking.currency || booking.pricing?.currency || 'USD',
      reason: ''
    });
    setAuthForm({ authorizedAmount: authorized.toFixed(2), currency: booking.currency || 'USD' });
    setPaymentForm({
      paymentStatus: normalizeStatus(booking.payment_status || booking.payment?.status || 'PENDING'),
      referenceId: booking.transaction_reference || booking.transactionReference || booking.payment_reference_id || booking.payment?.referenceId || ''
    });
    setPaymentSplits((booking.payment_splits || booking.paymentSplits || []).map((split, index) => ({
      _key: split.id || `split-${Date.now()}-${index}`,
      merchantName: split.merchant_name || split.merchantName || '',
      amount: String(split.amount ?? '')
    })));
    setBillingForm({
      cardholderName: bd.cardholderName || bd.cardholder_name || booking.passenger_name || '',
      cardBrand: bd.cardBrand || bd.card_brand || '',
      cardLast4: bd.cardLast4 || bd.card_last4 || bd.last4 || '',
      cardExpMonth: bd.cardExpMonth || bd.card_exp_month || bd.expMonth || '',
      cardExpYear: bd.cardExpYear || bd.card_exp_year || bd.expYear || '',
      billingEmail: bd.billingEmail || bd.billing_email || booking.email || '',
      billingPhone: bd.billingPhone || bd.billing_phone || booking.phone || '',
      addressLine1: bd.addressLine1 || bd.billing_address_line1 || '',
      addressLine2: bd.addressLine2 || bd.billing_address_line2 || '',
      city: bd.city || bd.billing_city || '',
      stateProvince: bd.stateProvince || bd.billing_state || '',
      postalCode: bd.postalCode || bd.billing_postal_code || '',
      country: bd.country || bd.billing_country || 'United States',
      transactionReference: bd.transactionReference || booking.transaction_reference || booking.transactionReference || ''
    });
    setTicketForm({
      airlineName: booking.airline_name || booking.airlineName || booking.carrier || '',
      airlineCode: booking.airline_code || booking.airlineCode || '',
      airlineLogoUrl: booking.airline_logo_url || booking.airlineLogoUrl || '',
      airlineConfirmationNumber: booking.airline_confirmation_number || booking.airlineConfirmationNumber || booking.airline_pnr || booking.pnr || '',
      ticketNumber: booking.ticket_number || booking.ticketNumber || '',
      ticketIssuedAt: booking.ticket_issued_at ? String(booking.ticket_issued_at).slice(0, 10) : (booking.ticketIssuedAt ? String(booking.ticketIssuedAt).slice(0, 10) : ''),
      supplierConfirmation: booking.supplier_confirmation || booking.supplierConfirmation || '',
      ticketNotes: booking.ticket_notes || booking.ticketNotes || ''
    });
    setSectionState({});
  }, []);

  const loadBookingDetail = useCallback(async identifier => {
    if (!identifier) return null;
    setDetailLoading(true);
    setDetailError('');
    try {
      const response = await withTimeout(adminAPI.getBookingById(identifier), 15000, 'Booking details');
      const booking = unwrapBooking(response);
      if (!booking?.id) throw new Error('The booking details response did not contain a database booking ID.');
      setSelectedBooking(booking);
      hydrateEditor(booking);
      return booking;
    } catch (error) {
      setDetailError(errorMessage(error, 'Unable to load booking details.'));
      return null;
    } finally {
      setDetailLoading(false);
    }
  }, [hydrateEditor]);

  const loadBookings = useCallback(async () => {
    if (!hasAuth()) return;
    setLoading(true);
    setListError('');
    try {
      const response = await withTimeout(
        adminAPI.getBookings({ ...filters, page, pageSize: PAGE_SIZE }),
        15000,
        'Booking list'
      );
      const list = response?.bookings || response?.data || [];
      setBookings(Array.isArray(list) ? list : []);
      setPagination(response?.pagination || { totalPages: 1, totalRecords: list.length });
      setSelectedIds(current => current.filter(id => list.some(booking => booking.id === id)));
    } catch (error) {
      setListError(errorMessage(error, 'Unable to load bookings.'));
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  const loadSummaryData = useCallback(async () => {
    if (!hasAuth()) return;
    const [statsRes, analyticsRes] = await Promise.allSettled([
      withTimeout(adminAPI.getStats(), 12000, 'Dashboard stats'),
      withTimeout(adminAPI.getAnalytics(30), 12000, 'Analytics')
    ]);

    if (statsRes.status === 'fulfilled') setStats(statsRes.value?.data || statsRes.value || null);
    if (analyticsRes.status === 'fulfilled') setAnalytics(analyticsRes.value?.data || analyticsRes.value || null);
  }, []);

  const loadAbandoned = useCallback(async ({ force = false } = {}) => {
    if (!hasAuth() || (abandonedLoaded && !force)) return;
    setAbandonedLoading(true);
    try {
      const response = await withTimeout(adminAPI.getAbandonedBookings(), 12000, 'Incomplete checkouts');
      setAbandoned(response?.data || response || []);
      setAbandonedLoaded(true);
    } catch (error) {
      setListError(errorMessage(error, 'Unable to load incomplete checkouts.'));
    } finally {
      setAbandonedLoading(false);
    }
  }, [abandonedLoaded]);

  useEffect(() => {
    const timer = setTimeout(() => loadBookings(), 250);
    return () => clearTimeout(timer);
  }, [loadBookings]);

  useEffect(() => { loadSummaryData(); }, [loadSummaryData]);

  useEffect(() => {
    if (activeTab === 'abandoned') loadAbandoned();
  }, [activeTab, loadAbandoned]);

  useEffect(() => {
    if (code && hasAuth()) loadBookingDetail(code);
  }, [code, loadBookingDetail]);

  const refreshAll = async () => {
    const tasks = [loadBookings(), loadSummaryData()];
    if (activeTab === 'abandoned') tasks.push(loadAbandoned({ force: true }));
    await Promise.all(tasks);
    if (selectedBooking?.id) await loadBookingDetail(selectedBooking.id);
  };

  const openBooking = async booking => {
    setEditMode(false);
    await loadBookingDetail(booking.id || booking.confirmation_code || booking.confirmationCode);
  };

  const saveAndRefresh = async (section, promiseFactory, successMessage) => {
    if (!selectedBooking?.id) return null;
    setBusyFlag(section, true);
    setMessage(section, 'info', 'Saving…');
    try {
      const response = await withTimeout(Promise.resolve().then(promiseFactory), 20000, successMessage || 'Save');
      if (response?.success === false) throw new Error(response?.error?.message || 'The server rejected the update.');
      const responseBooking = unwrapBooking(response);
      const fresh = responseBooking?.id ? responseBooking : await loadBookingDetail(selectedBooking.id);
      if (fresh?.id) {
        setSelectedBooking(fresh);
        hydrateEditor(fresh);
      } else {
        await loadBookingDetail(selectedBooking.id);
      }
      setMessage(section, 'success', response?.message || successMessage || 'Saved successfully.');
      await loadBookings();
      return response;
    } catch (error) {
      setMessage(section, 'error', errorMessage(error, 'Unable to save changes.'));
      throw error;
    } finally {
      setBusyFlag(section, false);
    }
  };

  const saveStatus = async () => {
    try {
      await saveAndRefresh('status', () => adminAPI.patchStatusNotes(selectedBooking.id, {
        newStatus: statusForm.status,
        internalNotes: statusForm.notes
      }), 'Status & notes saved.');
    } catch { /* rendered in section */ }
  };

  const canonicalSegments = input => input.map((segment, index) => {
    const direction = segment.journey_direction === 'return' ? 'return' : 'outbound';
    const sameDirectionBefore = input.slice(0, index + 1).filter(item => (item.journey_direction === 'return' ? 'return' : 'outbound') === direction).length;
    return {
      ...segment,
      journey_direction: direction,
      direction,
      segment_sequence: sameDirectionBefore,
      origin_airport: String(segment.origin_airport || '').toUpperCase(),
      destination_airport: String(segment.destination_airport || '').toUpperCase(),
      carrier_code: String(segment.carrier_code || '').toUpperCase()
    };
  });

  const persistItinerary = async inputSegments => {
    const finalSegments = canonicalSegments(inputSegments);
    if (finalSegments.length === 0) throw new Error('Add or import at least one flight before saving.');
    const invalid = finalSegments.find(segment => !/^[A-Z]{3}$/.test(segment.origin_airport) || !/^[A-Z]{3}$/.test(segment.destination_airport));
    if (invalid) throw new Error('Every flight needs valid 3-letter origin and destination airport codes.');

    return saveAndRefresh('itinerary', () => adminAPI.patchItinerary(selectedBooking.id, {
      segments: finalSegments,
      expectedVersion: selectedBooking.updated_at || selectedBooking.version
    }), 'Itinerary saved.');
  };

  const saveItinerary = async () => {
    try { await persistItinerary(segments); } catch { /* section message */ }
  };

  const applyImportedItinerary = async ({ segments: importedSegments }) => {
    const response = await persistItinerary(importedSegments.map(normalizeEditableSegment));
    if (!response) throw new Error('The itinerary could not be verified after save.');
    return response;
  };

  const clearItinerary = async () => {
    if (!window.confirm('Clear every saved flight segment from this booking?')) return;
    try {
      await saveAndRefresh('itinerary', () => adminAPI.patchItinerary(selectedBooking.id, { clear: true }), 'Itinerary cleared.');
      setSegments([]);
    } catch { /* section message */ }
  };

  const savePricing = async () => {
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
    try {
      await saveAndRefresh('pricing', () => adminAPI.patchPricing(selectedBooking.id, {
        supplierFare,
        taxesAndFees: taxes,
        customerTotal,
        currency: pricingForm.currency || 'USD',
        reason: pricingForm.reason.trim(),
        bookingVersion: selectedBooking.updated_at
      }), 'Pricing saved.');
    } catch { /* section message */ }
  };

  const saveAuthorization = async () => {
    const amount = num(authForm.authorizedAmount, NaN);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage('authorization', 'error', 'Authorized amount must be greater than zero.');
      return;
    }
    try {
      await saveAndRefresh('authorization', () => adminAPI.patchAuthorizationSettings(selectedBooking.id, {
        authorizedAmount: amount,
        currency: authForm.currency || 'USD'
      }), 'Authorization settings saved.');
    } catch { /* section message */ }
  };

  const savePayment = async () => {
    if (!paymentSplits.length) {
      setMessage('payment', 'error', 'Add at least one payment split.');
      return;
    }
    const normalizedSplits = paymentSplits.map(split => ({
      merchantName: split.merchantName.trim(),
      amount: num(split.amount, NaN)
    }));
    if (normalizedSplits.some(split => !split.merchantName || !Number.isFinite(split.amount) || split.amount <= 0)) {
      setMessage('payment', 'error', 'Every split needs a merchant name and an amount greater than zero.');
      return;
    }
    const splitTotal = normalizedSplits.reduce((sum, split) => sum + Math.round(split.amount * 100), 0) / 100;
    const bookingTotal = num(pricingForm.customerTotal, 0);
    if (Math.abs(splitTotal - bookingTotal) > 0.001) {
      setMessage('payment', 'error', `Payment splits total ${money(splitTotal)} but the booking total is ${money(bookingTotal)}.`);
      return;
    }
    if (paymentForm.paymentStatus === 'PAID' && !paymentForm.referenceId.trim()) {
      setMessage('payment', 'error', 'A transaction/reference ID is required before marking a payment PAID.');
      return;
    }
    try {
      await saveAndRefresh('payment', () => adminAPI.patchPaymentAuthorization(selectedBooking.id, {
        splits: normalizedSplits,
        paymentState: paymentForm.paymentStatus,
        referenceId: paymentForm.referenceId.trim() || null,
        paidAmount: paymentForm.paymentStatus === 'PAID' ? bookingTotal : null,
        bookingVersion: selectedBooking.updated_at,
        reason: 'Admin dashboard payment update'
      }), 'Payment saved.');
    } catch { /* section message */ }
  };

  const saveBilling = async () => {
    const last4 = String(billingForm.cardLast4 || '').replace(/\D/g, '');
    if (last4 && !/^\d{4}$/.test(last4)) {
      setMessage('billing', 'error', 'Card last 4 must be exactly four digits.');
      return;
    }
    if (billingForm.cardExpMonth && (num(billingForm.cardExpMonth) < 1 || num(billingForm.cardExpMonth) > 12)) {
      setMessage('billing', 'error', 'Expiry month must be between 1 and 12.');
      return;
    }
    try {
      await saveAndRefresh('billing', () => adminAPI.patchBillingDetails(selectedBooking.id, {
        billingDetails: {
          ...billingForm,
          cardLast4: last4 || undefined,
          cardExpMonth: billingForm.cardExpMonth ? Number(billingForm.cardExpMonth) : undefined,
          cardExpYear: billingForm.cardExpYear ? Number(billingForm.cardExpYear) : undefined
        }
      }), 'Billing details saved.');
    } catch { /* section message */ }
  };

  const saveTicket = async () => {
    const pnr = String(ticketForm.airlineConfirmationNumber || '').trim().toUpperCase();
    if (pnr && !/^[A-Z0-9]{6}$/.test(pnr)) {
      setMessage('ticket', 'error', 'PNR must contain exactly 6 letters or numbers.');
      return;
    }
    const ticketNumber = String(ticketForm.ticketNumber || '').replace(/\D/g, '');
    if (ticketNumber && !/^\d{1,13}$/.test(ticketNumber)) {
      setMessage('ticket', 'error', 'Ticket number must contain 1–13 digits.');
      return;
    }
    try {
      await saveAndRefresh('ticket', () => adminAPI.patchAirlineDetails(selectedBooking.id, {
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
    } catch { /* section message */ }
  };

  const sendEmail = async type => {
    if (!selectedBooking?.id) return;
    const info = buildEmailInfo(selectedBooking, type);
    const resend = emailWasSent(info.status);
    const action = type === 'booking_request'
      ? (resend ? 'resend_booking_request_email' : 'send_booking_request_email')
      : type === 'authorization'
        ? (resend ? 'resend_authorization' : 'send_authorization')
        : (resend ? 'resend_final_ticket_email' : 'send_final_ticket_email');

    if (type === 'final_ticket') {
      const pnr = String(selectedBooking.airline_confirmation_number || selectedBooking.airlineConfirmationNumber || selectedBooking.airline_pnr || selectedBooking.pnr || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(pnr)) {
        setMessage('emails', 'error', 'Save a valid 6-character PNR before sending the final ticket email.');
        return;
      }
      if (extractSegments(selectedBooking).length === 0) {
        setMessage('emails', 'error', 'Save an itinerary before sending the final ticket email.');
        return;
      }
    }

    setBusyFlag(`email-${type}`, true);
    setMessage('emails', 'info', `Sending ${type.replace('_', ' ')} email…`);
    try {
      const response = await withTimeout(
        adminAPI.sendEmailAction(selectedBooking.id, action, { clientRequestId: crypto?.randomUUID?.() || `email-${Date.now()}` }),
        35000,
        'Email delivery'
      );
      if (response?.success === false) throw new Error(response?.error?.message || 'Email dispatch failed.');
      setMessage('emails', 'success', response?.message || 'Email sent successfully.');
      await loadBookingDetail(selectedBooking.id);
    } catch (error) {
      setMessage('emails', 'error', errorMessage(error, 'Email dispatch failed.'));
    } finally {
      setBusyFlag(`email-${type}`, false);
    }
  };

  const downloadAuthorizationPdf = async () => {
    if (!selectedBooking?.id) return;
    setBusyFlag('pdf', true);
    setMessage('emails', 'info', 'Generating authorization evidence PDF…');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/admin/bookings/${selectedBooking.id}/authorization-pdf`, {
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
      anchor.download = `authorization-${selectedBooking.confirmation_code || selectedBooking.id}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage('emails', 'success', 'Authorization evidence PDF downloaded.');
    } catch (error) {
      setMessage('emails', 'error', error?.name === 'AbortError' ? 'PDF generation timed out.' : errorMessage(error));
    } finally {
      clearTimeout(timeout);
      setBusyFlag('pdf', false);
    }
  };

  const exportSelected = async () => {
    if (!selectedIds.length) return;
    setBusyFlag('export', true);
    try {
      const documentData = await withTimeout(adminAPI.exportSelectedBackups(selectedIds), 20000, 'Backup export');
      const blob = new Blob([JSON.stringify(documentData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `fare-transit-bookings-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      window.alert(errorMessage(error, 'Backup export failed.'));
    } finally {
      setBusyFlag('export', false);
    }
  };

  const openDeleteModal = ids => {
    const valid = ids.filter(Boolean);
    if (!valid.length) return;
    setDeleteModal({ open: true, ids: valid });
    setDeletePassword('');
    setDeleteConfirmText('');
    setDeleteError('');
    setDeleteResult(null);
  };

  const closeDeleteModal = () => {
    if (deleteBusy) return;
    setDeleteModal({ open: false, ids: [] });
    setDeletePassword('');
    setDeleteConfirmText('');
    setDeleteError('');
    setDeleteResult(null);
  };

  const confirmDelete = async () => {
    if (!deletePassword) { setDeleteError('Enter the admin password.'); return; }
    if (deleteConfirmText !== 'DELETE') { setDeleteError('Type DELETE exactly to confirm.'); return; }

    setDeleteBusy(true);
    setDeleteError('');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/bookings/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          bookingIds: deleteModal.ids,
          adminPassword: deletePassword,
          confirmationText: deleteConfirmText
        }),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error?.message || `Delete failed with HTTP ${response.status}.`);
      }
      setDeleteResult(data);
      const deletedIds = new Set((data.results || []).filter(item => item.status === 'DELETED').map(item => item.bookingId));
      setSelectedIds(current => current.filter(id => !deletedIds.has(id)));
      if (selectedBooking?.id && deletedIds.has(selectedBooking.id)) {
        setSelectedBooking(null);
        setEditMode(false);
      }
      await loadBookings();
      await loadSummaryData();
      if (activeTab === 'abandoned') await loadAbandoned({ force: true });
    } catch (error) {
      const message = error?.name === 'AbortError'
        ? 'Deletion took too long. The list has been refreshed so you can verify whether the booking was removed.'
        : errorMessage(error, 'Deletion failed.');
      setDeleteError(message);
      await loadBookings();
    } finally {
      clearTimeout(timeout);
      setDeleteBusy(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('adminSession');
    navigate('/admin/login', { replace: true });
  };

  const toggleSelectAll = checked => {
    setSelectedIds(checked ? bookings.map(booking => booking.id).filter(Boolean) : []);
  };

  const toggleSelected = id => {
    setSelectedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  };

  const addManualSegment = () => {
    setSegments(current => [...current, normalizeEditableSegment({
      journey_direction: 'outbound',
      cabin: 'Economy'
    }, current.length)]);
  };

  const updateSegment = (index, field, value) => {
    setSegments(current => current.map((segment, idx) => idx === index ? { ...segment, [field]: value } : segment));
  };

  const removeSegment = index => setSegments(current => current.filter((_, idx) => idx !== index));

  const bookingRequestInfo = buildEmailInfo(selectedBooking, 'booking_request');
  const authorizationInfo = buildEmailInfo(selectedBooking, 'authorization');
  const finalTicketInfo = buildEmailInfo(selectedBooking, 'final_ticket');

  const totalRevenue = stats?.totalRevenue ?? bookings
    .filter(booking => String(booking.payment_status || '').toLowerCase() === 'paid')
    .reduce((sum, booking) => sum + num(booking.total_amount ?? booking.customer_price, 0), 0);

  return (
    <div className="adv2-page">
      <Helmet><title>Admin Dashboard | FareTransit</title></Helmet>

      <header className="adv2-header">
        <div className="adv2-header__inner">
          <div className="adv2-brand"><span>◆</span><span>FareTransit Admin</span></div>
          <div className="adv2-header__actions">
            <span className="adv2-badge adv2-badge--success">{analytics?.realtimeActiveUsers ?? 0} active now</span>
            <button className="adv2-button adv2-button--secondary" type="button" onClick={refreshAll}>Refresh</button>
            <button className="adv2-button adv2-button--danger" type="button" onClick={logout}>Logout</button>
          </div>
        </div>
      </header>

      <main className="adv2-shell">
        <div className="adv2-toolbar">
          <div className="adv2-tabs">
            <button className={`adv2-button adv2-button--tab ${activeTab === 'bookings' ? 'active' : ''}`} type="button" onClick={() => setActiveTab('bookings')}>Bookings</button>
            <button className={`adv2-button adv2-button--tab ${activeTab === 'analytics' ? 'active' : ''}`} type="button" onClick={() => setActiveTab('analytics')}>Analytics</button>
            <button className={`adv2-button adv2-button--tab ${activeTab === 'abandoned' ? 'active' : ''}`} type="button" onClick={() => setActiveTab('abandoned')}>Incomplete Forms{abandonedLoaded ? ` (${abandoned.length})` : ''}</button>
          </div>
          <span className="adv2-spacer" />
          <button className="adv2-button adv2-button--primary" type="button" onClick={() => navigate('/admin/bookings/new')}>+ Create New Booking</button>
          <button className="adv2-button adv2-button--secondary" type="button" onClick={() => setBackupImportOpen(true)}>Import Backup</button>
        </div>

        <div className="adv2-kpis">
          <div className="adv2-kpi"><div className="adv2-kpi__label">Total bookings</div><div className="adv2-kpi__value">{pagination.totalRecords ?? bookings.length}</div><div className="adv2-kpi__sub">Supabase records</div></div>
          <div className="adv2-kpi"><div className="adv2-kpi__label">Paid revenue</div><div className="adv2-kpi__value">{money(totalRevenue)}</div><div className="adv2-kpi__sub">Recorded paid bookings</div></div>
          <div className="adv2-kpi"><div className="adv2-kpi__label">Pending</div><div className="adv2-kpi__value">{stats?.pendingCount ?? bookings.filter(item => normalizeStatus(item.status) === 'PENDING').length}</div><div className="adv2-kpi__sub">Booking workflow</div></div>
          <div className="adv2-kpi"><div className="adv2-kpi__label">Incomplete forms</div><div className="adv2-kpi__value">{abandonedLoaded ? abandoned.length : '—'}</div><div className="adv2-kpi__sub">Loaded only when opened</div></div>
          <div className="adv2-kpi"><div className="adv2-kpi__label">Visitors</div><div className="adv2-kpi__value">{analytics?.totalVisitors ?? 0}</div><div className="adv2-kpi__sub">Last 30 days</div></div>
          <div className="adv2-kpi"><div className="adv2-kpi__label">Active now</div><div className="adv2-kpi__value">{analytics?.realtimeActiveUsers ?? 0}</div><div className="adv2-kpi__sub">GA4 realtime</div></div>
        </div>

        {activeTab === 'bookings' && (
          <>
            <section className="adv2-card">
              <div className="adv2-card__header">
                <h2>Customer Bookings</h2>
                <div className="adv2-filters">
                  <input className="adv2-search" placeholder="Reference" value={filters.reference} onChange={event => { setFilters(current => ({ ...current, reference: event.target.value })); setPage(1); }} />
                  <input className="adv2-search" placeholder="Customer name" value={filters.name} onChange={event => { setFilters(current => ({ ...current, name: event.target.value })); setPage(1); }} />
                  <input className="adv2-search" placeholder="Email" value={filters.email} onChange={event => { setFilters(current => ({ ...current, email: event.target.value })); setPage(1); }} />
                  <select className="adv2-select" value={filters.status} onChange={event => { setFilters(current => ({ ...current, status: event.target.value })); setPage(1); }}>
                    <option value="">All statuses</option>
                    {['DRAFT','PENDING','AWAITING_AUTHORIZATION','AUTHORIZED','READY_FOR_TICKETING','TICKETED','DONE','CANCELLED','FAILED'].map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
                  </select>
                  <button className="adv2-button adv2-button--secondary" type="button" onClick={() => { setFilters({ reference: '', name: '', email: '', status: '' }); setPage(1); }}>Reset</button>
                  <button className="adv2-button adv2-button--secondary" type="button" onClick={loadBookings}>Search</button>
                </div>
              </div>

              {selectedIds.length > 0 && (
                <div className="adv2-bulkbar">
                  <strong>{selectedIds.length} selected</strong>
                  <span className="adv2-spacer" />
                  <button className="adv2-button adv2-button--secondary" type="button" onClick={exportSelected} disabled={busy.export}>{busy.export ? 'Exporting…' : 'Export Selected'}</button>
                  <button className="adv2-button adv2-button--danger" type="button" onClick={() => openDeleteModal(selectedIds)}>Delete Selected</button>
                  <button className="adv2-button adv2-button--secondary" type="button" onClick={() => setSelectedIds([])}>Clear</button>
                </div>
              )}

              {listError && <div className="adv2-alert adv2-alert--error">{listError}</div>}

              <div className="adv2-table-wrap">
                {loading ? <div className="adv2-loading">Loading bookings…</div> : bookings.length === 0 ? <div className="adv2-empty">No bookings match these filters.</div> : (
                  <table className="adv2-table">
                    <thead><tr>
                      <th><input type="checkbox" checked={bookings.length > 0 && selectedIds.length === bookings.length} onChange={event => toggleSelectAll(event.target.checked)} /></th>
                      <th>Reference</th><th>Customer</th><th>Carrier / Route</th><th>Passengers</th><th>Amount</th><th>Booking</th><th>Payment</th><th>Date</th><th>Action</th>
                    </tr></thead>
                    <tbody>
                      {bookings.map(booking => (
                        <tr key={booking.id || booking.confirmation_code}>
                          <td><input type="checkbox" checked={selectedIds.includes(booking.id)} onChange={() => toggleSelected(booking.id)} /></td>
                          <td><span className="adv2-ref">{booking.confirmation_code || booking.confirmationCode || String(booking.id || '').slice(0, 8)}</span></td>
                          <td><div className="adv2-strong">{booking.passenger_name || booking.customer_name || 'N/A'}</div><div className="adv2-muted">{booking.email || 'N/A'}</div></td>
                          <td><div className="adv2-strong">{booking.carrier || booking.airline || booking.airline_name || '—'}</div><div className="adv2-muted">{booking.origin_code && booking.destination_code ? `${booking.origin_code} → ${booking.destination_code}` : 'No saved route'}</div></td>
                          <td>{booking.passengers_count || booking.travellers?.length || 1}</td>
                          <td>{money(booking.customer_price ?? booking.total_amount ?? booking.pricing?.customerTotal, booking.currency)}</td>
                          <td><span className={`adv2-badge ${statusBadgeClass(booking.status)}`}>{normalizeStatus(booking.status)}</span></td>
                          <td><span className={`adv2-badge ${statusBadgeClass(booking.payment_status)}`}>{normalizeStatus(booking.payment_status)}</span></td>
                          <td>{booking.created_at ? new Date(booking.created_at).toLocaleDateString() : 'N/A'}</td>
                          <td><button className="adv2-button adv2-button--secondary" type="button" onClick={() => openBooking(booking)}>View / Edit</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="adv2-pagination">
                <span className="adv2-muted">Page {page} of {Math.max(1, pagination.totalPages || 1)}</span>
                <button className="adv2-button adv2-button--secondary" type="button" disabled={page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}>Previous</button>
                <button className="adv2-button adv2-button--secondary" type="button" disabled={page >= (pagination.totalPages || 1)} onClick={() => setPage(current => current + 1)}>Next</button>
              </div>
            </section>

            {selectedBooking && (
              <section className="adv2-detail">
                <div className="adv2-detail__header">
                  <div>
                    <h2>{editMode ? 'Edit Booking' : 'Booking Details'}</h2>
                    <span className="adv2-ref">{selectedBooking.confirmation_code || selectedBooking.confirmationCode || selectedBooking.id}</span>
                  </div>
                  <div className="adv2-detail__actions">
                    <button className="adv2-button adv2-button--secondary" type="button" onClick={() => loadBookingDetail(selectedBooking.id)} disabled={detailLoading}>{detailLoading ? 'Refreshing…' : 'Refresh'}</button>
                    <button className="adv2-button adv2-button--primary" type="button" onClick={() => setEditMode(current => !current)}>{editMode ? 'Exit Editing' : 'Edit Booking'}</button>
                    <button className="adv2-button adv2-button--danger" type="button" onClick={() => openDeleteModal([selectedBooking.id])}>Delete Booking</button>
                    <button className="adv2-button adv2-button--secondary" type="button" onClick={() => { setSelectedBooking(null); setEditMode(false); }}>Close</button>
                  </div>
                </div>

                <div className="adv2-detail__body">
                  {detailError && <div className="adv2-alert adv2-alert--error">{detailError}</div>}
                  <div className="adv2-summary-grid">
                    <div className="adv2-summary-item"><span>Booking</span><strong>{normalizeStatus(selectedBooking.status)}</strong></div>
                    <div className="adv2-summary-item"><span>Authorization</span><strong>{normalizeStatus(selectedBooking.authorization_status || selectedBooking.authorization?.status || 'PENDING')}</strong></div>
                    <div className="adv2-summary-item"><span>Payment</span><strong>{normalizeStatus(selectedBooking.payment_status)}</strong></div>
                    <div className="adv2-summary-item"><span>Ticketing</span><strong>{ticketForm.airlineConfirmationNumber ? 'PNR SAVED' : 'NOT TICKETED'}</strong></div>
                    <div className="adv2-summary-item"><span>Passenger</span><strong>{selectedBooking.passenger_name || 'N/A'}</strong></div>
                    <div className="adv2-summary-item"><span>Email</span><strong>{selectedBooking.email || 'N/A'}</strong></div>
                    <div className="adv2-summary-item"><span>Total</span><strong>{money(selectedBooking.customer_price ?? selectedBooking.total_amount, selectedBooking.currency)}</strong></div>
                    <div className="adv2-summary-item"><span>Flights</span><strong>{extractSegments(selectedBooking).length}</strong></div>
                  </div>

                  {editMode && (
                    <>
                      <section className="adv2-editor-section">
                        <div className="adv2-editor-section__header"><h3>Status & Internal Notes</h3></div>
                        <div className="adv2-editor-section__body">
                          <div className="adv2-grid adv2-grid--2">
                            <label className="adv2-field"><span>Booking status</span><select value={statusForm.status} onChange={event => setStatusForm(current => ({ ...current, status: event.target.value }))}>{['DRAFT','PENDING','AWAITING_AUTHORIZATION','AUTHORIZED','READY_FOR_TICKETING','TICKETED','DONE','CANCELLED','FAILED'].map(status => <option key={status}>{status}</option>)}</select></label>
                            <label className="adv2-field"><span>Internal notes</span><textarea value={statusForm.notes} onChange={event => setStatusForm(current => ({ ...current, notes: event.target.value }))} /></label>
                          </div>
                          <SectionMessage state={sectionState.status} />
                        </div>
                        <div className="adv2-editor-section__footer"><button className="adv2-button adv2-button--primary" type="button" onClick={saveStatus} disabled={busy.status}>{busy.status ? 'Saving…' : 'Save Status & Notes'}</button></div>
                      </section>

                      <section className="adv2-editor-section">
                        <div className="adv2-editor-section__header">
                          <h3>Itinerary</h3><span className="adv2-spacer" />
                          <button className="adv2-button adv2-button--primary" type="button" onClick={() => setGdsOpen(true)}>Import GDS / JSON</button>
                          <button className="adv2-button adv2-button--secondary" type="button" onClick={addManualSegment}>+ Enter Manually</button>
                          <button className="adv2-button adv2-button--danger" type="button" onClick={clearItinerary} disabled={busy.itinerary || segments.length === 0}>Clear Itinerary</button>
                        </div>
                        <div className="adv2-editor-section__body">
                          <div className="adv2-note">There is no separate outbound/inbound import step. Import the source once; direction is read from the GDS/JSON when available and can be corrected per flight below.</div>
                          {segments.length === 0 ? <div className="adv2-empty">No itinerary saved. Import GDS/JSON or add a flight manually.</div> : (
                            <div className="adv2-segment-list">
                              {segments.map((segment, index) => (
                                <div className="adv2-segment-card" key={segment._key || index}>
                                  <div className="adv2-segment-card__head"><strong>Flight {index + 1}: {segment.origin_airport || '---'} → {segment.destination_airport || '---'}</strong><button className="adv2-link-danger" type="button" onClick={() => removeSegment(index)}>Remove</button></div>
                                  <div className="adv2-grid adv2-grid--4">
                                    <label className="adv2-field"><span>Direction</span><select value={segment.journey_direction || 'outbound'} onChange={event => updateSegment(index, 'journey_direction', event.target.value)}><option value="outbound">Outbound</option><option value="return">Return</option></select></label>
                                    <label className="adv2-field"><span>Airline</span><input value={segment.carrier_name || ''} onChange={event => updateSegment(index, 'carrier_name', event.target.value)} /></label>
                                    <label className="adv2-field"><span>Carrier code</span><input maxLength={3} value={segment.carrier_code || ''} onChange={event => updateSegment(index, 'carrier_code', event.target.value.toUpperCase())} /></label>
                                    <label className="adv2-field"><span>Flight #</span><input value={segment.flight_number || ''} onChange={event => updateSegment(index, 'flight_number', event.target.value)} /></label>
                                    <label className="adv2-field"><span>Origin</span><input maxLength={3} value={segment.origin_airport || ''} onChange={event => updateSegment(index, 'origin_airport', event.target.value.toUpperCase())} /></label>
                                    <label className="adv2-field"><span>Destination</span><input maxLength={3} value={segment.destination_airport || ''} onChange={event => updateSegment(index, 'destination_airport', event.target.value.toUpperCase())} /></label>
                                    <label className="adv2-field"><span>Departure date</span><input type="date" value={segment.departure_date || ''} onChange={event => updateSegment(index, 'departure_date', event.target.value)} /></label>
                                    <label className="adv2-field"><span>Departure time</span><input type="time" value={segment.departure_time || ''} onChange={event => updateSegment(index, 'departure_time', event.target.value)} /></label>
                                    <label className="adv2-field"><span>Arrival date</span><input type="date" value={segment.arrival_date || ''} onChange={event => updateSegment(index, 'arrival_date', event.target.value)} /></label>
                                    <label className="adv2-field"><span>Arrival time</span><input type="time" value={segment.arrival_time || ''} onChange={event => updateSegment(index, 'arrival_time', event.target.value)} /></label>
                                    <label className="adv2-field"><span>Cabin</span><select value={segment.cabin || 'Economy'} onChange={event => updateSegment(index, 'cabin', event.target.value)}><option>Economy</option><option>Premium Economy</option><option>Business</option><option>First</option></select></label>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          <SectionMessage state={sectionState.itinerary} />
                        </div>
                        <div className="adv2-editor-section__footer"><button className="adv2-button adv2-button--primary" type="button" onClick={saveItinerary} disabled={busy.itinerary || segments.length === 0}>{busy.itinerary ? 'Saving & verifying…' : 'Save Itinerary'}</button></div>
                      </section>

                      <section className="adv2-editor-section">
                        <div className="adv2-editor-section__header"><h3>Pricing</h3></div>
                        <div className="adv2-editor-section__body">
                          <div className="adv2-grid adv2-grid--4">
                            <label className="adv2-field"><span>Supplier fare</span><input inputMode="decimal" value={pricingForm.supplierFare} onChange={event => setPricingForm(current => ({ ...current, supplierFare: event.target.value }))} /></label>
                            <label className="adv2-field"><span>Taxes & fees</span><input inputMode="decimal" value={pricingForm.taxes} onChange={event => setPricingForm(current => ({ ...current, taxes: event.target.value }))} /></label>
                            <label className="adv2-field"><span>Customer total</span><input inputMode="decimal" value={pricingForm.customerTotal} onChange={event => setPricingForm(current => ({ ...current, customerTotal: event.target.value }))} /></label>
                            <label className="adv2-field"><span>Currency</span><input value={pricingForm.currency} maxLength={3} onChange={event => setPricingForm(current => ({ ...current, currency: event.target.value.toUpperCase() }))} /></label>
                          </div>
                          <label className="adv2-field" style={{ marginTop: 9 }}><span>Reason for pricing revision *</span><input value={pricingForm.reason} onChange={event => setPricingForm(current => ({ ...current, reason: event.target.value }))} placeholder="Required audit reason" /></label>
                          <SectionMessage state={sectionState.pricing} />
                        </div>
                        <div className="adv2-editor-section__footer"><button className="adv2-button adv2-button--primary" type="button" onClick={savePricing} disabled={busy.pricing}>{busy.pricing ? 'Saving…' : 'Save Pricing'}</button></div>
                      </section>

                      <section className="adv2-editor-section">
                        <div className="adv2-editor-section__header"><h3>Passenger Authorization</h3></div>
                        <div className="adv2-editor-section__body">
                          <div className="adv2-grid adv2-grid--2">
                            <label className="adv2-field"><span>Authorized amount</span><input inputMode="decimal" value={authForm.authorizedAmount} onChange={event => setAuthForm(current => ({ ...current, authorizedAmount: event.target.value }))} /></label>
                            <label className="adv2-field"><span>Currency</span><input maxLength={3} value={authForm.currency} onChange={event => setAuthForm(current => ({ ...current, currency: event.target.value.toUpperCase() }))} /></label>
                          </div>
                          <SectionMessage state={sectionState.authorization} />
                        </div>
                        <div className="adv2-editor-section__footer"><button className="adv2-button adv2-button--primary" type="button" onClick={saveAuthorization} disabled={busy.authorization}>{busy.authorization ? 'Saving…' : 'Save Authorization Settings'}</button></div>
                      </section>

                      <section className="adv2-editor-section">
                        <div className="adv2-editor-section__header"><h3>Payment</h3><span className="adv2-spacer" /><button className="adv2-button adv2-button--secondary" type="button" onClick={() => setPaymentSplits(current => [...current, { _key: `split-${Date.now()}`, merchantName: 'FareTransit LLC', amount: '0.00' }])}>+ Add Split</button></div>
                        <div className="adv2-editor-section__body">
                          <div className="adv2-grid adv2-grid--2">
                            <label className="adv2-field"><span>Payment status</span><select value={paymentForm.paymentStatus} onChange={event => setPaymentForm(current => ({ ...current, paymentStatus: event.target.value }))}>{['PENDING','PROCESSING','PAID','FAILED','REFUNDED'].map(status => <option key={status}>{status}</option>)}</select></label>
                            <label className="adv2-field"><span>Transaction / reference ID</span><input value={paymentForm.referenceId} onChange={event => setPaymentForm(current => ({ ...current, referenceId: event.target.value }))} /></label>
                          </div>
                          <div className="adv2-segment-list">
                            {paymentSplits.map((split, index) => (
                              <div className="adv2-grid adv2-grid--3" key={split._key || index}>
                                <label className="adv2-field"><span>Merchant</span><input value={split.merchantName} onChange={event => setPaymentSplits(current => current.map((item, idx) => idx === index ? { ...item, merchantName: event.target.value } : item))} /></label>
                                <label className="adv2-field"><span>Amount</span><input inputMode="decimal" value={split.amount} onChange={event => setPaymentSplits(current => current.map((item, idx) => idx === index ? { ...item, amount: event.target.value } : item))} /></label>
                                <div className="adv2-row" style={{ alignItems: 'end' }}><button className="adv2-button adv2-button--danger" type="button" onClick={() => setPaymentSplits(current => current.filter((_, idx) => idx !== index))}>Remove</button></div>
                              </div>
                            ))}
                          </div>
                          <div className="adv2-note">Split total: {money(paymentSplits.reduce((sum, split) => sum + num(split.amount, 0), 0))} · Booking total: {money(pricingForm.customerTotal)}</div>
                          <SectionMessage state={sectionState.payment} />
                        </div>
                        <div className="adv2-editor-section__footer"><button className="adv2-button adv2-button--primary" type="button" onClick={savePayment} disabled={busy.payment}>{busy.payment ? 'Saving & verifying…' : 'Save Payment'}</button></div>
                      </section>

                      <section className="adv2-editor-section">
                        <div className="adv2-editor-section__header"><h3>Billing & Card Reference</h3></div>
                        <div className="adv2-editor-section__body">
                          <div className="adv2-alert adv2-alert--info">Only safe card metadata is stored here. Full PAN and CVV/CVC are never accepted.</div>
                          <div className="adv2-grid adv2-grid--4">
                            <label className="adv2-field"><span>Cardholder</span><input value={billingForm.cardholderName} onChange={event => setBillingForm(current => ({ ...current, cardholderName: event.target.value }))} /></label>
                            <label className="adv2-field"><span>Brand</span><select value={billingForm.cardBrand} onChange={event => setBillingForm(current => ({ ...current, cardBrand: event.target.value }))}><option value="">Select</option><option value="Visa">Visa</option><option value="Mastercard">Mastercard</option><option value="Amex">Amex</option><option value="Discover">Discover</option></select></label>
                            <label className="adv2-field"><span>Last 4</span><input maxLength={4} inputMode="numeric" value={billingForm.cardLast4} onChange={event => setBillingForm(current => ({ ...current, cardLast4: event.target.value.replace(/\D/g, '').slice(0, 4) }))} /></label>
                            <label className="adv2-field"><span>Expiry month</span><input maxLength={2} inputMode="numeric" value={billingForm.cardExpMonth} onChange={event => setBillingForm(current => ({ ...current, cardExpMonth: event.target.value.replace(/\D/g, '').slice(0, 2) }))} /></label>
                            <label className="adv2-field"><span>Expiry year</span><input maxLength={4} inputMode="numeric" value={billingForm.cardExpYear} onChange={event => setBillingForm(current => ({ ...current, cardExpYear: event.target.value.replace(/\D/g, '').slice(0, 4) }))} /></label>
                            <label className="adv2-field"><span>Billing email</span><input value={billingForm.billingEmail} onChange={event => setBillingForm(current => ({ ...current, billingEmail: event.target.value }))} /></label>
                            <label className="adv2-field"><span>Billing phone</span><input value={billingForm.billingPhone} onChange={event => setBillingForm(current => ({ ...current, billingPhone: event.target.value }))} /></label>
                            <label className="adv2-field"><span>Address line 1</span><input value={billingForm.addressLine1} onChange={event => setBillingForm(current => ({ ...current, addressLine1: event.target.value }))} /></label>
                            <label className="adv2-field"><span>Address line 2</span><input value={billingForm.addressLine2} onChange={event => setBillingForm(current => ({ ...current, addressLine2: event.target.value }))} /></label>
                            <label className="adv2-field"><span>City</span><input value={billingForm.city} onChange={event => setBillingForm(current => ({ ...current, city: event.target.value }))} /></label>
                            <label className="adv2-field"><span>State</span><input value={billingForm.stateProvince} onChange={event => setBillingForm(current => ({ ...current, stateProvince: event.target.value }))} /></label>
                            <label className="adv2-field"><span>Postal code</span><input value={billingForm.postalCode} onChange={event => setBillingForm(current => ({ ...current, postalCode: event.target.value }))} /></label>
                            <label className="adv2-field"><span>Country</span><input value={billingForm.country} onChange={event => setBillingForm(current => ({ ...current, country: event.target.value }))} /></label>
                          </div>
                          <SectionMessage state={sectionState.billing} />
                        </div>
                        <div className="adv2-editor-section__footer"><button className="adv2-button adv2-button--primary" type="button" onClick={saveBilling} disabled={busy.billing}>{busy.billing ? 'Saving & verifying…' : 'Save Billing Details'}</button></div>
                      </section>

                      <section className="adv2-editor-section">
                        <div className="adv2-editor-section__header"><h3>Airline Ticket Details</h3></div>
                        <div className="adv2-editor-section__body">
                          <div className="adv2-grid adv2-grid--4">
                            <label className="adv2-field"><span>Airline name</span><input value={ticketForm.airlineName} onChange={event => setTicketForm(current => ({ ...current, airlineName: event.target.value }))} /></label>
                            <label className="adv2-field"><span>Airline code</span><input maxLength={3} value={ticketForm.airlineCode} onChange={event => setTicketForm(current => ({ ...current, airlineCode: event.target.value.toUpperCase() }))} /></label>
                            <label className="adv2-field"><span>PNR (6 chars)</span><input maxLength={6} value={ticketForm.airlineConfirmationNumber} onChange={event => setTicketForm(current => ({ ...current, airlineConfirmationNumber: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) }))} /></label>
                            <label className="adv2-field"><span>Ticket number</span><input maxLength={13} inputMode="numeric" value={ticketForm.ticketNumber} onChange={event => setTicketForm(current => ({ ...current, ticketNumber: event.target.value.replace(/\D/g, '').slice(0, 13) }))} /></label>
                            <label className="adv2-field"><span>Issue date</span><input type="date" value={ticketForm.ticketIssuedAt} onChange={event => setTicketForm(current => ({ ...current, ticketIssuedAt: event.target.value }))} /></label>
                            <label className="adv2-field"><span>Supplier confirmation</span><input value={ticketForm.supplierConfirmation} onChange={event => setTicketForm(current => ({ ...current, supplierConfirmation: event.target.value }))} /></label>
                            <label className="adv2-field"><span>Notes</span><input value={ticketForm.ticketNotes} onChange={event => setTicketForm(current => ({ ...current, ticketNotes: event.target.value }))} /></label>
                          </div>
                          <SectionMessage state={sectionState.ticket} />
                        </div>
                        <div className="adv2-editor-section__footer"><button className="adv2-button adv2-button--primary" type="button" onClick={saveTicket} disabled={busy.ticket}>{busy.ticket ? 'Saving & verifying…' : 'Save Airline Details'}</button></div>
                      </section>
                    </>
                  )}

                  <section className="adv2-editor-section">
                    <div className="adv2-editor-section__header"><h3>Email Delivery Activity</h3></div>
                    <div className="adv2-editor-section__body">
                      <SectionMessage state={sectionState.emails} />
                      <div className="adv2-email-grid">
                        {[
                          ['booking_request', 'Booking Request Email', bookingRequestInfo],
                          ['authorization', 'Authorization Email', authorizationInfo],
                          ['final_ticket', 'Final Ticket Email', finalTicketInfo]
                        ].map(([type, title, info]) => (
                          <div className="adv2-email-card" key={type}>
                            <div className="adv2-email-card__header"><strong>{title}</strong><span className={`adv2-badge ${statusBadgeClass(info.status)}`}>{normalizeStatus(info.status)}</span></div>
                            <div className="adv2-muted">Recipient: {info.recipient || 'N/A'}</div>
                            <div className="adv2-muted">Sent: {info.sentAt ? new Date(info.sentAt).toLocaleString() : 'N/A'}</div>
                            <div className="adv2-muted">Provider ID: {info.providerId || 'N/A'}</div>
                            {info.error && <div className="adv2-alert adv2-alert--error">{info.error}</div>}
                            <div className="adv2-email-card__actions">
                              <button className="adv2-button adv2-button--secondary" type="button" onClick={() => setPreviewModal({ isOpen: true, emailType: type })}>Preview</button>
                              <button className={emailWasSent(info.status) ? 'adv2-button adv2-button--secondary' : 'adv2-button adv2-button--primary'} type="button" onClick={() => sendEmail(type)} disabled={busy[`email-${type}`]}>{busy[`email-${type}`] ? 'Sending…' : (emailWasSent(info.status) ? 'Resend' : 'Send')}</button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="adv2-row adv2-row--wrap" style={{ marginTop: 10 }}><button className="adv2-button adv2-button--secondary" type="button" onClick={downloadAuthorizationPdf} disabled={busy.pdf}>{busy.pdf ? 'Generating PDF…' : 'Download Authorization Evidence PDF'}</button></div>
                    </div>
                  </section>
                </div>
              </section>
            )}
          </>
        )}

        {activeTab === 'analytics' && (
          <section className="adv2-card">
            <div className="adv2-card__header"><h2>GA4 Analytics & Live Users</h2></div>
            <div className="adv2-card__body">
              <div className="adv2-summary-grid">
                <div className="adv2-summary-item"><span>Active now</span><strong>{analytics?.realtimeActiveUsers ?? 0}</strong></div>
                <div className="adv2-summary-item"><span>Total visitors</span><strong>{analytics?.totalVisitors ?? 0}</strong></div>
                <div className="adv2-summary-item"><span>Page views</span><strong>{analytics?.pageViews ?? analytics?.totalPageViews ?? 'N/A'}</strong></div>
                <div className="adv2-summary-item"><span>Period</span><strong>30 days</strong></div>
              </div>
              {Array.isArray(analytics?.deviceCategories) && analytics.deviceCategories.length > 0 && (
                <div className="adv2-table-wrap" style={{ marginTop: 14 }}><table className="adv2-table" style={{ minWidth: 500 }}><thead><tr><th>Device</th><th>Users</th></tr></thead><tbody>{analytics.deviceCategories.map((item, index) => <tr key={index}><td>{item.category}</td><td>{item.users}</td></tr>)}</tbody></table></div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'abandoned' && (
          <section className="adv2-card">
            <div className="adv2-card__header"><h2>Incomplete Passenger Forms</h2></div>
            <div className="adv2-table-wrap">
              {abandonedLoading ? <div className="adv2-loading">Loading incomplete checkout sessions…</div> : abandoned.length === 0 ? <div className="adv2-empty">No incomplete checkout sessions.</div> : (
                <table className="adv2-table"><thead><tr><th>Session</th><th>Traveller</th><th>Email</th><th>Last step</th><th>Updated</th></tr></thead><tbody>{abandoned.map(item => <tr key={item.id || item.session_key}><td>{item.session_key || item.id}</td><td>{item.traveller_info ? `${item.traveller_info.firstName || ''} ${item.traveller_info.lastName || ''}`.trim() : 'Incomplete'}</td><td>{item.contact_info?.email || 'N/A'}</td><td>{item.current_step || 'passenger_form'}</td><td>{item.updated_at ? new Date(item.updated_at).toLocaleString() : 'N/A'}</td></tr>)}</tbody></table>
              )}
            </div>
          </section>
        )}
      </main>

      <AdminGdsImportModalV2 isOpen={gdsOpen} onClose={() => setGdsOpen(false)} onApply={applyImportedItinerary} />

      {previewModal.isOpen && selectedBooking?.id && (
        <AdminEmailPreviewModal
          isOpen={previewModal.isOpen}
          onClose={() => setPreviewModal({ isOpen: false, emailType: 'booking_request' })}
          bookingId={selectedBooking.id}
          emailType={previewModal.emailType}
          onMarkManuallySentSuccess={() => loadBookingDetail(selectedBooking.id)}
        />
      )}

      {backupImportOpen && (
        <BookingBackupImportModal
          isOpen={backupImportOpen}
          onClose={() => setBackupImportOpen(false)}
          onImportComplete={() => { loadBookings(); loadSummaryData(); if (activeTab === 'abandoned') loadAbandoned({ force: true }); }}
        />
      )}

      {deleteModal.open && (
        <div className="adv2-modal-backdrop" role="dialog" aria-modal="true" aria-label="Delete bookings">
          <div className="adv2-modal">
            <div className="adv2-modal__header"><div><h2>Delete {deleteModal.ids.length} Booking{deleteModal.ids.length === 1 ? '' : 's'}?</h2><p>This permanently removes the selected booking records and related data.</p></div><button className="adv2-icon-button" type="button" onClick={closeDeleteModal} disabled={deleteBusy}>✕</button></div>
            <div className="adv2-modal__body">
              <div className="adv2-danger-box">This cannot be undone unless you exported a backup first. The delete request now has a hard timeout and returns a visible result instead of leaving the dashboard stuck on “Deleting…”.</div>
              <div className="adv2-grid adv2-grid--2" style={{ marginTop: 12 }}>
                <label className="adv2-field"><span>Admin password</span><input type="password" value={deletePassword} onChange={event => setDeletePassword(event.target.value)} /></label>
                <label className="adv2-field"><span>Type DELETE to confirm</span><input value={deleteConfirmText} onChange={event => setDeleteConfirmText(event.target.value)} /></label>
              </div>
              {deleteError && <div className="adv2-alert adv2-alert--error">{deleteError}</div>}
              {deleteResult && <div className="adv2-alert adv2-alert--success">Deleted: {deleteResult.summary?.deleted || 0} · Protected: {deleteResult.summary?.protected || 0} · Failed: {deleteResult.summary?.failed || 0}</div>}
              {deleteResult?.results?.map((item, index) => <div className={`adv2-alert ${item.status === 'DELETED' ? 'adv2-alert--success' : item.status === 'PROTECTED' ? 'adv2-alert--warning' : 'adv2-alert--error'}`} key={index}>{item.confirmationCode}: {item.status}{item.message ? ` — ${item.message}` : ''}</div>)}
            </div>
            <div className="adv2-modal__footer"><span className="adv2-spacer" /><button className="adv2-button adv2-button--secondary" type="button" onClick={closeDeleteModal} disabled={deleteBusy}>{deleteResult ? 'Done' : 'Cancel'}</button>{!deleteResult && <button className="adv2-button adv2-button--danger" type="button" onClick={confirmDelete} disabled={deleteBusy || deleteConfirmText !== 'DELETE' || !deletePassword}>{deleteBusy ? 'Deleting & verifying…' : 'Delete Permanently'}</button>}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboardPageV2;
