import { bookingAPI } from '../../../shared/api/api';
import journeySessionAPI from '../../../shared/api/journeySessionApi';

const LEGACY_BAGGAGE_KEY = 'faretransit:baggage-requests:v1';
const FLEX_RATE = 0.10;
const MAX_BAGS = 3;
let originalJourneyUpdate = null;
let persistTimer = null;
let observer = null;
let renderTimer = null;
let latestBookings = [];

const money = (value) => {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
};

function readJson(key, fallback = null) {
  try { const raw = sessionStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}

function checkoutToken() {
  return sessionStorage.getItem('checkoutSessionToken')
    || window.location.pathname.match(/^\/booking\/(c_[\w-]+)/)?.[1]
    || null;
}

function storageKey() { return `faretransit:trip-addons:${checkoutToken() || 'legacy'}`; }

function normalize(raw = {}) {
  let baggage = Array.isArray(raw?.baggage) ? raw.baggage : [];
  if (!baggage.length && raw && !Array.isArray(raw) && !raw.flexAssist) {
    // Migrate the original baggage-only session shape: {0:{OUTBOUND:1,...}}
    baggage = Object.entries(raw).flatMap(([indexText, legs]) => ['OUTBOUND','RETURN'].map((direction) => ({
      travelerIndex: Number.parseInt(indexText, 10), direction, quantity: Number.parseInt(legs?.[direction], 10) || 0,
    })));
  }
  const dedupe = new Map();
  baggage.forEach((item) => {
    const travelerIndex = Number.parseInt(item?.travelerIndex ?? item?.passengerIndex, 10);
    const direction = String(item?.direction || item?.journeyDirection || 'OUTBOUND').toUpperCase();
    const quantity = Math.min(MAX_BAGS, Math.max(0, Number.parseInt(item?.quantity, 10) || 0));
    if (!Number.isInteger(travelerIndex) || travelerIndex < 0 || !['OUTBOUND','RETURN'].includes(direction) || !quantity) return;
    dedupe.set(`${travelerIndex}:${direction}`, { travelerIndex, direction, quantity });
  });
  return {
    version: 'TRIP_ADDONS_V1',
    flexAssist: { selected: raw?.flexAssist?.selected === true },
    baggage: [...dedupe.values()],
  };
}

function selection() {
  const scoped = readJson(storageKey(), null);
  if (scoped) return normalize(scoped);
  const legacy = readJson(LEGACY_BAGGAGE_KEY, null);
  if (legacy) {
    const migrated = normalize(legacy);
    save(migrated);
    try { sessionStorage.removeItem(LEGACY_BAGGAGE_KEY); } catch { /* best effort */ }
    return migrated;
  }
  return normalize({});
}

function save(value) { try { sessionStorage.setItem(storageKey(), JSON.stringify(normalize(value))); } catch { /* best effort */ } }
function passengerCards() { return Array.from(document.querySelectorAll('[data-passenger-index]')); }

function passengerCount() {
  const cards = passengerCards();
  if (cards.length) return cards.length;
  const s = readJson('searchParams', {});
  return Math.max(1, (parseInt(s?.adults || 1, 10) || 0) + (parseInt(s?.children || 0, 10) || 0) + (parseInt(s?.infants || 0, 10) || 0));
}

function passengerName(index) {
  const card = passengerCards()[index];
  const first = card?.querySelector('input[placeholder*="First Name"]')?.value?.trim() || '';
  const last = card?.querySelector('input[placeholder*="Last Name"]')?.value?.trim() || '';
  return [first,last].filter(Boolean).join(' ') || `Passenger ${index + 1}`;
}

function flightPrice(flight) {
  for (const value of [flight?.price?.finalPrice, flight?.price?.total, flight?.price?.customerPrice, flight?.finalPrice, flight?.totalPrice, flight?.price]) {
    const amount = money(value); if (amount > 0) return amount;
  }
  return 0;
}

function ticketBase() {
  const outbound = readJson('selectedFlight');
  const returned = readJson('returnFlight') || readJson('selectedReturnFlight');
  return money((flightPrice(outbound) + flightPrice(returned)) * passengerCount());
}

function ticketDue() {
  const voucher = readJson('tfsAppliedVoucher') || readJson('fareTransitAppliedVoucher');
  return money(voucher?.finalPrice) || ticketBase();
}

const hasReturn = () => Boolean(readJson('returnFlight') || readJson('selectedReturnFlight'));

function routeLabel(flight, fallback) {
  const from = flight?.departure?.airport || flight?.departure_airport || flight?.departureAirport || flight?.origin?.code || flight?.origin;
  const to = flight?.arrival?.airport || flight?.arrival_airport || flight?.arrivalAirport || flight?.destination?.code || flight?.destination;
  return from && to ? `${from} → ${to}` : fallback;
}

function quote() {
  const s = selection();
  const base = ticketBase();
  const flexPrice = s.flexAssist.selected ? money(base * FLEX_RATE) : 0;
  return { selection: s, base, flexPrice, addOnTotal: flexPrice, grandTotal: money(ticketDue() + flexPrice) };
}

async function persist() {
  const token = checkoutToken();
  if (!token) return;
  const response = await journeySessionAPI.getCheckout(token);
  const payload = response?.data?.payload || response?.payload || {};
  const updater = originalJourneyUpdate || journeySessionAPI.updateCheckout.bind(journeySessionAPI);
  await updater(token, { payload: { ...payload, addons: selection() } });
}

function queuePersist() {
  clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => persist().catch(() => {}), 350);
}

function buildBaggageRequests() {
  return selection().baggage
    .filter((item) => item.travelerIndex < passengerCount() && (item.direction !== 'RETURN' || hasReturn()))
    .map((item) => ({ passengerIndex: item.travelerIndex, addonType: 'CHECKED_BAGGAGE', journeyDirection: item.direction, quantity: item.quantity, requestedWeightKg: 23, termsVersion: 'BAGGAGE_REQUEST_V1' }));
}

function patchApis() {
  if (!journeySessionAPI.__fareTransitTripAddonPersistence) {
    originalJourneyUpdate = journeySessionAPI.updateCheckout.bind(journeySessionAPI);
    journeySessionAPI.updateCheckout = (token, patch = {}) => {
      if (!patch?.payload || typeof patch.payload !== 'object') return originalJourneyUpdate(token, patch);
      return originalJourneyUpdate(token, { ...patch, payload: { ...patch.payload, addons: selection() } });
    };
    Object.defineProperty(journeySessionAPI, '__fareTransitTripAddonPersistence', { value: true });
  }

  if (!bookingAPI.__fareTransitTripAddonSubmit) {
    const originalCreate = bookingAPI.create.bind(bookingAPI);
    bookingAPI.create = async (data = {}) => {
      if (!checkoutToken() || !window.location.pathname.startsWith('/booking')) return originalCreate(data);
      await persist();
      const q = quote();
      const ticketComponent = money(data.customer_price || data.customerPrice || data.displayedWebsitePrice || ticketDue());
      const response = await originalCreate({
        ...data,
        baggageRequests: buildBaggageRequests(),
        trip_addons: q.selection,
        flex_assist_fee: q.flexPrice,
        add_on_total: q.addOnTotal,
        customer_price: money(ticketComponent + q.addOnTotal),
      });
      if (response?.success !== false) {
        try { sessionStorage.removeItem(storageKey()); } catch { /* best effort */ }
      }
      return response;
    };
    Object.defineProperty(bookingAPI, '__fareTransitTripAddonSubmit', { value: true });
  }

  ['search','getByUser','getByReference'].forEach((method) => {
    if (typeof bookingAPI[method] !== 'function' || bookingAPI[method].__ftTripAddonCapture) return;
    const original = bookingAPI[method].bind(bookingAPI);
    const wrapped = async (...args) => {
      const response = await original(...args);
      const data = method === 'getByReference'
        ? [response?.data || response?.booking || response].filter(Boolean)
        : (Array.isArray(response?.data) ? response.data : (Array.isArray(response) ? response : []));
      if (data.length) latestBookings = data;
      scheduleRender(true);
      return response;
    };
    Object.defineProperty(wrapped, '__ftTripAddonCapture', { value: true });
    bookingAPI[method] = wrapped;
  });
}

function updateFlex(selected) {
  const next = selection(); next.flexAssist.selected = Boolean(selected); save(next); queuePersist(); renderCheckout(true); syncTotals(true);
}

function updateBag(travelerIndex, direction, quantity) {
  const next = selection();
  const map = new Map(next.baggage.map((b) => [`${b.travelerIndex}:${b.direction}`, b]));
  const qty = Math.min(MAX_BAGS, Math.max(0, Number.parseInt(quantity, 10) || 0));
  const key = `${travelerIndex}:${direction}`;
  if (qty) map.set(key, { travelerIndex, direction, quantity: qty }); else map.delete(key);
  next.baggage = [...map.values()]; save(next); queuePersist(); renderCheckout(true); syncTotals(true);
}

function ensureHost() {
  if (!window.location.pathname.startsWith('/booking')) return null;
  let host = document.getElementById('ft-trip-addons-host');
  if (host?.isConnected) return host;
  const paymentHeader = document.getElementById('accordion-header-payment');
  const paymentSection = paymentHeader?.closest('.accordion-section');
  if (!paymentSection?.parentElement) return null;
  host = document.createElement('section');
  host.id = 'ft-trip-addons-host';
  host.className = 'accordion-section accordion-section--open ft-trip-addons';
  paymentSection.parentElement.insertBefore(host, paymentSection);
  return host;
}

function baggageRows(s) {
  const outbound = readJson('selectedFlight');
  const returned = readJson('returnFlight') || readJson('selectedReturnFlight');
  const dirs = hasReturn() ? [['OUTBOUND', outbound, 'Outbound journey'], ['RETURN', returned, 'Return journey']] : [['OUTBOUND', outbound, 'Outbound journey']];
  let html = '';
  for (let p = 0; p < passengerCount(); p += 1) {
    html += `<div class="ft-trip-addon-passenger"><strong>${passengerName(p)}</strong>`;
    dirs.forEach(([direction, flight, fallback]) => {
      const qty = s.baggage.find((b) => b.travelerIndex === p && b.direction === direction)?.quantity || 0;
      html += `<div class="ft-trip-addon-bag-row"><div><span>${direction === 'RETURN' ? 'Return' : 'Outbound'}</span><b>${routeLabel(flight, fallback)}</b><small>Up to 23 kg / 50 lb per requested bag</small></div><label>Extra checked bags<select data-ft-p="${p}" data-ft-d="${direction}">${[0,1,2,3].map((n) => `<option value="${n}"${n === qty ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>`;
    });
    html += '</div>';
  }
  return html;
}

function renderCheckout(force = false) {
  const host = ensureHost(); if (!host) return;
  const q = quote();
  const signature = JSON.stringify([q.selection, q.base, passengerCount(), hasReturn()]);
  if (!force && host.dataset.signature === signature) return;
  host.dataset.signature = signature;
  const bagCount = q.selection.baggage.reduce((sum, item) => sum + item.quantity, 0);
  host.innerHTML = `<div class="ft-trip-addons__header"><span class="accordion-step-badge">4</span><div><span>OPTIONAL TRIP SERVICES</span><h2>Customize Your Trip</h2><p>Optional — you can continue without adding anything.</p></div></div>
    <div class="ft-trip-addons__body">
      <article class="ft-trip-addon-card ft-trip-addon-card--flex"><div class="ft-trip-addon-card__top"><div><span class="ft-trip-addon-icon">↻</span><h3>Flex Assist</h3></div><strong>+$${money(q.base * FLEX_RATE).toFixed(2)}</strong></div><p>Get additional agency support if your travel plans change.</p><ul><li>Priority change assistance</li><li>Alternative-flight and date support</li><li>Dedicated rebooking servicing</li></ul><div class="ft-trip-addon-disclosure"><strong>Important:</strong> Flex Assist is not travel insurance and does not convert the airline fare into a flexible fare. Airline fare differences, taxes, penalties, availability and fare rules may still apply. Changes are not guaranteed.</div><label class="ft-trip-addon-toggle"><input id="ft-flex-toggle" type="checkbox" ${q.selection.flexAssist.selected ? 'checked' : ''}><span><strong>Add Flex Assist</strong><small>10% of ticket selling price ($${q.base.toFixed(2)} × 10%)</small></span><b>+$${money(q.base * FLEX_RATE).toFixed(2)}</b></label></article>
      <article class="ft-trip-addon-card"><div class="ft-trip-addon-card__top"><div><span class="ft-trip-addon-icon">🧳</span><h3>Add Checked Baggage</h3></div><strong>$0.00 now</strong></div><p>Request additional checked baggage by passenger and journey direction.</p><div class="ft-trip-addon-disclosure ft-trip-addon-disclosure--neutral">This submits a request only. Baggage is subject to airline/supplier availability, weight and size limits, fare rules and the confirmed supplier fee. We will send the confirmed baggage price after your reservation; baggage is paid separately and is not confirmed until supplier purchase succeeds.</div>${baggageRows(q.selection)}${bagCount ? `<p class="ft-trip-addon-pending">${bagCount} extra bag${bagCount === 1 ? '' : 's'} requested · $0 due now · pending airline confirmation</p>` : ''}</article>
      <div class="ft-trip-addons__summary"><span>Optional services added to airfare now</span><strong>$${q.addOnTotal.toFixed(2)} USD</strong></div>
    </div>`;
  host.querySelector('#ft-flex-toggle')?.addEventListener('change', (e) => updateFlex(e.target.checked));
  host.querySelectorAll('[data-ft-p]').forEach((el) => el.addEventListener('change', () => updateBag(Number(el.dataset.ftP), el.dataset.ftD, el.value)));
}

function setText(node, text) { if (node && String(node.textContent || '').replace(/\s+/g, ' ').trim() !== text) node.textContent = text; }

function syncTotals(force = false) {
  if (!window.location.pathname.startsWith('/booking')) return;
  const q = quote(); const finalText = `$${q.grandTotal.toFixed(2)} USD`;
  const totalRow = document.querySelector('.price-breakdown-section .price-row--total');
  if (totalRow?.parentElement) {
    let host = document.getElementById('ft-trip-addons-sidebar');
    if (!host) { host = document.createElement('div'); host.id = 'ft-trip-addons-sidebar'; totalRow.parentElement.insertBefore(host, totalRow); }
    const bagCount = q.selection.baggage.reduce((sum, b) => sum + b.quantity, 0);
    const html = `${q.selection.flexAssist.selected ? `<div class="price-row ft-addon-price-row"><span>Flex Assist (10%)</span><strong>+$${q.flexPrice.toFixed(2)}</strong></div>` : ''}${bagCount ? `<div class="price-row ft-addon-price-row"><span>Checked baggage request (${bagCount})</span><strong>$0.00 now</strong></div>` : ''}`;
    if (force || host.dataset.signature !== html) { host.dataset.signature = html; host.innerHTML = html; }
  }
  document.querySelectorAll('.price-total-amount,.booking-itinerary-pricing-summary__discounted').forEach((n) => setText(n, finalText));
  const mobile = document.querySelector('.mobile-summary-toggle-bar strong'); if (mobile) setText(mobile, finalText);
  const button = document.querySelector('.amtrak-btn.amtrak-btn--cta.amtrak-btn--full'); if (button && !/Securing|Processing/i.test(button.textContent || '')) setText(button.querySelector('span') || button, `🔒 Complete Secure Booking — ${finalText}`);
  const paymentHeader = document.getElementById('accordion-header-payment'); setText(paymentHeader?.querySelector('.accordion-section-title'), '5. Review & Payment');
  const badge = paymentHeader?.querySelector('.accordion-step-badge:not(.accordion-step-badge--complete)'); setText(badge, '5');
}

function baggageState(request) {
  const status = String(request?.status || 'REQUESTED').toUpperCase();
  const quoteData = request?.quote;
  if (status === 'CONFIRMED') return ['Baggage confirmed', `${request.quantity} × ${request.requested_weight_kg || 23} kg`, null];
  if (['PAID','PURCHASE_PENDING'].includes(status)) return ['Payment received', 'Supplier purchase in progress.', null];
  if (['PRICE_CONFIRMED','OFFER_SENT','AWAITING_PAYMENT'].includes(status) && quoteData?.public_token) return ['Baggage available', `${quoteData.currency || 'USD'} ${Number(quoteData.customer_price || 0).toFixed(2)}`, `/addons/pay/${quoteData.public_token}`];
  if (status === 'PRICE_EXPIRED') return ['Baggage price expired', 'A fresh quote is required.', null];
  if (status === 'UNAVAILABLE') return ['Baggage unavailable', 'The airline/supplier could not confirm it.', null];
  return ['Checking baggage availability', 'No baggage payment required yet.', null];
}

async function loadFlexRequests(reference, email) {
  if (!reference || !email) return [];
  const response = await fetch(`/api/addons/flex/${encodeURIComponent(reference)}/change-requests?email=${encodeURIComponent(email)}`);
  const body = await response.json().catch(() => ({}));
  return response.ok && body?.success && Array.isArray(body.data) ? body.data : [];
}

function enhanceFlexCard(host, booking) {
  const flex = booking?.flexAssist || booking?.flex_assist || booking?.tripAddons?.flexAssist || booking?.trip_addons?.flexAssist;
  if (!flex?.selected) return '';
  const ref = booking.confirmation_code || booking.confirmationCode || booking.id;
  const email = booking.email || '';
  return `<article class="ft-my-flex" data-flex-ref="${ref}" data-flex-email="${email}"><div class="ft-my-flex__head"><div><strong>↻ Flex Assist</strong><span>${String(flex.status || 'ACTIVE').replaceAll('_',' ')} · $${Number(flex.price || 0).toFixed(2)}</span></div>${String(flex.status || 'ACTIVE').toUpperCase() === 'ACTIVE' ? '<button type="button" data-flex-open>Request a Change</button>' : ''}</div><p>Agency change/rebooking assistance is active. Airline fare differences, penalties, taxes, availability and fare rules may still apply.</p><div class="ft-flex-form" hidden><label>Booking email<input type="email" value="${email}" data-flex-email-input></label><label>What would you like to change?<select data-flex-type><option value="TRAVEL_DATE">Travel date</option><option value="FLIGHT_TIME">Flight time</option><option value="FLIGHT">Flight</option><option value="DESTINATION">Destination</option><option value="OTHER">Other</option></select></label><label>Requested change<textarea rows="3" data-flex-notes></textarea></label><div><button type="button" data-flex-submit>Submit request</button><button type="button" data-flex-close>Cancel</button></div><span data-flex-message></span><div data-flex-history></div></div></article>`;
}

function wireFlex(host) {
  host.querySelectorAll('[data-flex-ref]').forEach((card) => {
    const panel = card.querySelector('.ft-flex-form');
    const history = card.querySelector('[data-flex-history]');
    const message = card.querySelector('[data-flex-message]');
    const refresh = async () => {
      const rows = await loadFlexRequests(card.dataset.flexRef, card.querySelector('[data-flex-email-input]').value.trim());
      history.innerHTML = rows.length ? rows.map((r) => `<div class="ft-flex-history-row"><span>${String(r.requestType || '').replaceAll('_',' ')}</span><strong>${String(r.status || '').replaceAll('_',' ')}</strong></div>`).join('') : '<small>No Flex change requests yet.</small>';
    };
    card.querySelector('[data-flex-open]')?.addEventListener('click', async () => { panel.hidden = false; await refresh(); });
    card.querySelector('[data-flex-close]')?.addEventListener('click', () => { panel.hidden = true; });
    card.querySelector('[data-flex-submit]')?.addEventListener('click', async () => {
      const email = card.querySelector('[data-flex-email-input]').value.trim();
      const notes = card.querySelector('[data-flex-notes]').value.trim();
      if (!email || !notes) { message.textContent = 'Enter booking email and requested change.'; return; }
      message.textContent = 'Submitting…';
      const response = await fetch(`/api/addons/flex/${encodeURIComponent(card.dataset.flexRef)}/change-requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, requestType: card.querySelector('[data-flex-type]').value, requestedDetails: { notes } }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.success) { message.textContent = body?.error?.message || 'Unable to submit request.'; return; }
      card.querySelector('[data-flex-notes]').value = ''; message.textContent = 'Flex Assist request submitted.'; await refresh();
    });
  });
}

function renderMyBookings(force = false) {
  if (!window.location.pathname.startsWith('/my-bookings')) return;
  const target = document.querySelector('.bookings-results-section'); if (!target || !latestBookings.length) return;
  let host = document.getElementById('ft-my-trip-addons');
  if (!host) { host = document.createElement('section'); host.id = 'ft-my-trip-addons'; host.className = 'ft-my-trip-addons'; target.appendChild(host); }
  const signature = JSON.stringify(latestBookings.map((b) => [b.id, b.flexAssist?.status || b.tripAddons?.flexAssist?.status, (b.addonRequests || b.addon_requests || []).map((r) => [r.id,r.status,r.quote?.customer_price])]));
  if (!force && host.dataset.signature === signature) return;
  host.dataset.signature = signature;
  host.innerHTML = latestBookings.map((booking) => {
    const requests = booking.addonRequests || booking.addon_requests || [];
    const flexHtml = enhanceFlexCard(host, booking);
    const baggageHtml = requests.length ? `<div class="ft-my-baggage-block"><h3>🧳 Extra Baggage</h3>${requests.map((request) => { const [title,detail,action] = baggageState(request); const t=request.traveller||{}; const name=[t.first_name,t.middle_name,t.last_name].filter(Boolean).join(' ')||'Passenger'; return `<article><div><strong>${name}</strong><span>${request.journey_direction === 'RETURN' ? 'Return' : 'Outbound'} · ${request.quantity} extra bag${request.quantity===1?'':'s'}</span></div><div><strong>${title}</strong><span>${detail}</span>${action ? `<a href="${action}">Pay for Baggage</a>` : ''}</div></article>`; }).join('')}</div>` : '';
    if (!flexHtml && !baggageHtml) return '';
    return `<section class="ft-my-booking-addons"><div class="ft-my-booking-addons__head"><span>TRIP OPTIONS</span><strong>Booking ${booking.confirmation_code || booking.confirmationCode || ''}</strong></div>${flexHtml}${baggageHtml}</section>`;
  }).join('');
  wireFlex(host);
}

function scheduleRender(force = false) {
  clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => { renderCheckout(force); syncTotals(force); renderMyBookings(force); }, 80);
}

export function installTripAddonsUX() {
  if (typeof window === 'undefined' || window.__fareTransitTripAddonsInstalled) return;
  window.__fareTransitTripAddonsInstalled = true;
  patchApis(); save(selection()); scheduleRender(true);
  observer = new MutationObserver(() => scheduleRender(false));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('input', () => scheduleRender(false), true);
  document.addEventListener('change', () => scheduleRender(false), true);
}

export default installTripAddonsUX;
