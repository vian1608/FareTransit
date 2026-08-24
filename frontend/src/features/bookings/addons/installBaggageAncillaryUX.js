import { bookingAPI } from '../../../shared/api/api';

const STORAGE_KEY = 'faretransit:baggage-requests:v1';
const MAX_BAGS = 5;
let observer = null;
let renderTimer = null;
let latestBookings = [];

function readJson(key, fallback = null) {
  try { const raw = sessionStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}

function selection() {
  const value = readJson(STORAGE_KEY, {});
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function saveSelection(value) { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* best effort */ } }
function clearSelection() { try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* best effort */ } }
function passengerCards() { return Array.from(document.querySelectorAll('[data-passenger-index]')); }

function passengerName(card, index) {
  const first = card?.querySelector('input[placeholder*="First Name"]')?.value?.trim() || '';
  const last = card?.querySelector('input[placeholder*="Last Name"]')?.value?.trim() || '';
  return [first, last].filter(Boolean).join(' ') || `Passenger ${index + 1}`;
}

function flightCode(flight, side) {
  if (!flight) return '';
  if (side === 'from') return flight?.departure?.airport || flight?.departure_airport || flight?.departureAirport || flight?.origin?.code || flight?.origin || '';
  return flight?.arrival?.airport || flight?.arrival_airport || flight?.arrivalAirport || flight?.destination?.code || flight?.destination || '';
}

function routeLabel(flight, fallback) {
  const from = flightCode(flight, 'from');
  const to = flightCode(flight, 'to');
  return from && to ? `${from} → ${to}` : fallback;
}

function hasReturn() { return Boolean(readJson('returnFlight') || readJson('selectedReturnFlight')); }

function buildRequests() {
  const state = selection();
  const count = passengerCards().length;
  const rows = [];
  Object.entries(state).forEach(([indexText, legs]) => {
    const passengerIndex = Number.parseInt(indexText, 10);
    if (!Number.isInteger(passengerIndex) || passengerIndex < 0 || passengerIndex >= count) return;
    ['OUTBOUND', 'RETURN'].forEach((journeyDirection) => {
      if (journeyDirection === 'RETURN' && !hasReturn()) return;
      const quantity = Math.min(MAX_BAGS, Math.max(0, Number.parseInt(legs?.[journeyDirection], 10) || 0));
      if (quantity > 0) rows.push({ passengerIndex, addonType: 'CHECKED_BAGGAGE', journeyDirection, quantity, requestedWeightKg: 23 });
    });
  });
  return rows;
}

function updateBag(index, direction, quantity) {
  const state = selection();
  const current = { OUTBOUND: 0, RETURN: 0, ...(state[index] || {}) };
  current[direction] = Math.min(MAX_BAGS, Math.max(0, Number.parseInt(quantity, 10) || 0));
  state[index] = current;
  saveSelection(state);
  renderCheckout(true);
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function ensureCheckoutHost() {
  if (!window.location.pathname.startsWith('/booking')) return null;
  let host = document.getElementById('faretransit-baggage-request');
  if (host?.isConnected) return host;
  const specialRequests = document.querySelector('#accordion-body-requests > div');
  if (!specialRequests) return null;
  host = document.createElement('section');
  host.id = 'faretransit-baggage-request';
  host.className = 'ft-baggage-request';
  specialRequests.appendChild(host);
  return host;
}

function renderCheckout(force = false) {
  const host = ensureCheckoutHost();
  if (!host) return;
  const cards = passengerCards();
  if (!cards.length) return;
  const state = selection();
  const outbound = readJson('selectedFlight');
  const returned = readJson('returnFlight') || readJson('selectedReturnFlight');
  const signature = JSON.stringify([state, cards.length, hasReturn(), cards.map((c, i) => passengerName(c, i))]);
  if (!force && host.dataset.signature === signature) return;
  host.dataset.signature = signature;

  const rows = cards.map((card, index) => {
    const current = state[index] || {};
    const leg = (direction, flight, fallback) => `<div class="ft-baggage-leg"><div><span>${direction === 'RETURN' ? 'Return' : 'Outbound'}</span><strong>${escapeHtml(routeLabel(flight, fallback))}</strong></div><label>Extra checked bags<select data-ft-bag-index="${index}" data-ft-bag-direction="${direction}">${[0,1,2,3,4,5].map((n) => `<option value="${n}"${Number(current[direction] || 0) === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>`;
    return `<article class="ft-baggage-passenger"><div class="ft-baggage-passenger__name">${escapeHtml(passengerName(card, index))}</div>${leg('OUTBOUND', outbound, 'Outbound journey')}${returned ? leg('RETURN', returned, 'Return journey') : ''}<small>Requested allowance: up to 23 kg / 50 lb per additional bag*</small></article>`;
  }).join('');
  const requested = buildRequests().reduce((sum, r) => sum + r.quantity, 0);

  host.innerHTML = `<div class="ft-baggage-head"><div><span>OPTIONAL TRIP ADD-ON</span><h3>🧳 Add Checked Baggage</h3></div><b>$0 due now</b></div>
  <div class="ft-baggage-disclosure"><strong>Baggage Request:</strong> Additional baggage is subject to airline availability, fare rules, weight and size restrictions, and applicable airline/supplier fees. Selecting baggage here submits a request only and does not confirm or purchase baggage. After your flight reservation is submitted, we will verify availability and send you the confirmed baggage price. <strong>Baggage is paid separately and will only be added after you approve the price and complete the additional payment.</strong></div>
  <div class="ft-baggage-list">${rows}</div>
  <div class="ft-baggage-summary"><div><span>Requested additional bags</span><strong>${requested}</strong></div><div><span>Amount due now</span><strong>$0.00</strong></div><div><span>Baggage price</span><strong>Pending airline confirmation</strong></div></div>
  ${requested ? '<p class="ft-baggage-pending">Requested — confirmation pending</p>' : ''}`;
  host.querySelectorAll('[data-ft-bag-index]').forEach((select) => select.addEventListener('change', () => updateBag(Number(select.dataset.ftBagIndex), select.dataset.ftBagDirection, select.value)));
}

function captureBookings(response) {
  const data = Array.isArray(response?.data) ? response.data : (Array.isArray(response) ? response : []);
  if (data.length || Array.isArray(response?.data)) latestBookings = data;
  renderMyBookings(true);
  return response;
}

function publicState(request) {
  const status = String(request?.status || 'REQUESTED').toUpperCase();
  const quote = request?.quote;
  if (status === 'CONFIRMED') return ['Baggage confirmed', `${request.quantity} × ${request.requested_weight_kg || 23} kg`, 'confirmed', null];
  if (['PAID','PURCHASE_PENDING'].includes(status)) return ['Payment received', "We're completing your baggage purchase.", 'paid', null];
  if (['PRICE_CONFIRMED','OFFER_SENT','AWAITING_PAYMENT'].includes(status) && quote?.public_token) return ['Baggage available', `${quote.currency || 'USD'} ${Number(quote.customer_price || 0).toFixed(2)}`, 'available', `/addons/pay/${quote.public_token}`];
  if (status === 'UNAVAILABLE') return ['Baggage unavailable', 'The airline/supplier could not confirm this request.', 'unavailable', null];
  if (status === 'DECLINED_BY_CUSTOMER') return ['Baggage declined', 'No baggage payment is due.', 'muted', null];
  if (status === 'PRICE_EXPIRED') return ['Baggage price expired', 'Contact support for a fresh quote.', 'unavailable', null];
  return ['Checking airline availability', 'No baggage payment required yet.', 'pending', null];
}

function renderMyBookings(force = false) {
  if (!window.location.pathname.startsWith('/my-bookings')) return;
  const target = document.querySelector('.bookings-results-section');
  if (!target) return;
  const rows = latestBookings.flatMap((booking) => (booking?.addonRequests || booking?.addon_requests || []).map((request) => ({ booking, request })));
  let host = document.getElementById('ft-my-bookings-baggage');
  if (!rows.length) { host?.remove(); return; }
  if (!host) { host = document.createElement('section'); host.id = 'ft-my-bookings-baggage'; host.className = 'ft-my-baggage'; target.appendChild(host); }
  const signature = JSON.stringify(rows.map(({request}) => [request.id, request.status, request.quote?.customer_price, request.fulfillment?.status]));
  if (!force && host.dataset.signature === signature) return;
  host.dataset.signature = signature;
  host.innerHTML = `<div class="ft-my-baggage__head"><span>TRIP ADD-ONS</span><h3>🧳 Extra Baggage</h3></div>${rows.map(({booking,request}) => {
    const [title, detail, tone, action] = publicState(request);
    const t = request.traveller || {};
    const name = [t.first_name,t.middle_name,t.last_name].filter(Boolean).join(' ') || 'Passenger';
    return `<article class="ft-my-baggage__item is-${tone}"><div><strong>${escapeHtml(name)}</strong><span>${request.journey_direction === 'RETURN' ? 'Return' : 'Outbound'} · ${request.quantity} additional checked bag${request.quantity === 1 ? '' : 's'}</span><small>Booking ${escapeHtml(booking.confirmation_code || booking.confirmationCode || '')}</small></div><div class="ft-my-baggage__state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span>${action ? `<a href="${escapeHtml(action)}">Pay for Baggage</a>` : ''}</div></article>`;
  }).join('')}`;
}

function patchBookingApi() {
  if (bookingAPI.__fareTransitBaggageAncillary) return;
  const originalCreate = bookingAPI.create.bind(bookingAPI);
  bookingAPI.create = async (data = {}) => {
    const baggageRequests = window.location.pathname.startsWith('/booking') ? buildRequests() : [];
    const response = await originalCreate({ ...data, baggageRequests });
    if (response?.success !== false) clearSelection();
    return response;
  };
  ['search','getByUser','getByReference'].forEach((method) => {
    if (typeof bookingAPI[method] !== 'function') return;
    const original = bookingAPI[method].bind(bookingAPI);
    bookingAPI[method] = async (...args) => {
      const response = await original(...args);
      if (method === 'getByReference' && response?.data && !Array.isArray(response.data)) latestBookings = [response.data];
      else captureBookings(response);
      renderMyBookings(true);
      return response;
    };
  });
  Object.defineProperty(bookingAPI, '__fareTransitBaggageAncillary', { value: true });
}

function addAdminShortcut() {
  if (!window.location.pathname.startsWith('/admin') || document.getElementById('ft-baggage-admin-link')) return;
  if (/^\/admin\/baggage/.test(window.location.pathname)) return;
  const a = document.createElement('a');
  a.id = 'ft-baggage-admin-link';
  a.href = '/admin/baggage';
  a.textContent = '🧳 Baggage Requests';
  a.className = 'ft-baggage-admin-link';
  document.body.appendChild(a);
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => { renderCheckout(); renderMyBookings(); addAdminShortcut(); }, 80);
}

export function installBaggageAncillaryUX() {
  patchBookingApi();
  scheduleRender();
  if (!observer) {
    observer = new MutationObserver(scheduleRender);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('input', scheduleRender, true);
  }
}

export default installBaggageAncillaryUX;
