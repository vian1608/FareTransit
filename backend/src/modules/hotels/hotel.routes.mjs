import express from 'express';
import { randomUUID } from 'node:crypto';
import rateLimit from '../../middleware/rate-limit.mjs';
import supabase from '../../integrations/supabase/supabase.client.mjs';
import hotelService from './hotel.service.mjs';

const router = express.Router();
const searchRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 30,
  message: 'Too many hotel search requests. Please wait a minute before searching again.'
});
const bookingRateLimiter = rateLimit({
  windowMs: 60000,
  maxRequests: 12,
  message: 'Too many hotel booking requests. Please wait a minute before trying again.'
});

const leadCode = () => `L-HTL-${Date.now().toString(36).toUpperCase()}`;
const hotelCode = () => `HTL-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;

function safeText(value, max = 300) {
  return String(value || '').trim().slice(0, max);
}

function nightsBetween(checkIn, checkOut) {
  const start = new Date(`${checkIn}T00:00:00Z`);
  const end = new Date(`${checkOut}T00:00:00Z`);
  const nights = Math.round((end - start) / 86400000);
  return Number.isFinite(nights) && nights > 0 ? nights : 1;
}

function providerSnapshot(property) {
  return {
    propertyToken: property?.propertyToken || null,
    name: property?.name || null,
    address: property?.address || null,
    hotelClass: property?.hotelClass || null,
    rating: property?.overallRating || null,
    reviews: property?.reviews || null,
    ratePerNight: property?.ratePerNight || null,
    totalRate: property?.totalRate || null,
    amenities: Array.isArray(property?.amenities) ? property.amenities.slice(0, 20) : [],
    image: property?.image || property?.images?.[0]?.thumbnail || null,
    priceSources: Array.isArray(property?.priceSources) ? property.priceSources.slice(0, 5) : []
  };
}

router.get('/search', searchRateLimiter, async (req, res, next) => {
  try {
    const data = await hotelService.search(req.query || {});
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/details', searchRateLimiter, async (req, res, next) => {
  try {
    const data = await hotelService.details(req.query || {});
    if (!data?.propertyToken && !data?.name) {
      return res.status(404).json({ success: false, error: { code: 'HOTEL_NOT_FOUND', message: 'Hotel details were not found.' } });
    }
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/booking-requests', bookingRateLimiter, async (req, res, next) => {
  let createdLeadId = null;
  try {
    const body = req.body || {};
    const customer = body.customer || {};
    const search = body.search || {};
    const firstName = safeText(customer.firstName, 80);
    const lastName = safeText(customer.lastName, 80);
    const email = safeText(customer.email, 180).toLowerCase();
    const phone = safeText(customer.phone, 50);
    const propertyToken = safeText(body.propertyToken, 1000);
    const clientRequestId = safeText(body.clientRequestId || randomUUID(), 120);

    if (!firstName || !lastName || !email || !/^\S+@\S+\.\S+$/.test(email) || !propertyToken) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_HOTEL_BOOKING_REQUEST', message: 'First name, last name, valid email and selected hotel are required.' } });
    }

    hotelService.validateSearchParams(search);

    const { data: existing, error: existingError } = await supabase
      .from('hotel_bookings')
      .select('id,hotel_code,lead_id,status')
      .eq('client_request_id', clientRequestId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      const { data: existingLead } = await supabase.from('crm_leads').select('lead_code').eq('id', existing.lead_id).maybeSingle();
      return res.json({
        success: true,
        data: { hotelBookingId: existing.id, hotelCode: existing.hotel_code, leadId: existing.lead_id, leadCode: existingLead?.lead_code || null, status: existing.status, duplicate: true }
      });
    }

    const property = await hotelService.details({ ...search, property_token: propertyToken });
    const nightlyRate = Number(property?.ratePerNight?.amount || 0);
    const stayNights = nightsBetween(search.check_in_date, search.check_out_date);
    const total = Number(property?.totalRate?.amount || (nightlyRate * stayNights) || 0);
    const currency = safeText(search.currency || 'USD', 6).toUpperCase();
    const selectedSource = property?.priceSources?.find((source) => source?.source) || null;

    const leadPayload = {
      lead_code: leadCode(),
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone || null,
      source: 'Website Hotel Search',
      product_interest: 'Hotel',
      destination: safeText(search.q, 200),
      travel_start_date: search.check_in_date,
      travel_end_date: search.check_out_date,
      estimated_value: total || null,
      status: 'BOOKING_IN_PROGRESS',
      priority: 'NORMAL',
      assigned_agent_id: null,
      team_id: null
    };

    const { data: lead, error: leadError } = await supabase.from('crm_leads').insert(leadPayload).select('id,lead_code').single();
    if (leadError) throw leadError;
    createdLeadId = lead.id;

    const bookingPayload = {
      hotel_code: hotelCode(),
      lead_id: lead.id,
      destination: safeText(search.q, 200),
      property_name: safeText(property?.name || body.propertyName || 'Selected hotel', 300),
      supplier_name: safeText(selectedSource?.source || 'Google Hotels via SerpApi', 180),
      check_in: search.check_in_date,
      check_out: search.check_out_date,
      rooms: Math.max(1, Number(body.rooms || 1)),
      adults: Math.max(1, Number(search.adults || 2)),
      children: Math.max(0, Number(search.children || 0)),
      rate: nightlyRate,
      taxes_fees: Math.max(0, total - (nightlyRate * stayNights)),
      total,
      currency,
      payment_status: 'pending',
      status: 'REQUESTED',
      notes: 'Customer submitted a hotel booking request from the public hotel search. Supplier confirmation is pending.',
      booking_source: 'website_serpapi_google_hotels',
      search_provider: 'SerpApi Google Hotels',
      external_property_token: propertyToken,
      search_snapshot: providerSnapshot(property),
      client_request_id: clientRequestId,
      requested_by_customer: true
    };

    const { data: booking, error: bookingError } = await supabase.from('hotel_bookings').insert(bookingPayload).select('id,hotel_code,status').single();
    if (bookingError) throw bookingError;

    const noteBody = `Website hotel request ${booking.hotel_code}: ${bookingPayload.property_name}, ${bookingPayload.check_in} to ${bookingPayload.check_out}, ${bookingPayload.currency} ${bookingPayload.total.toFixed(2)}. Source: SerpApi Google Hotels. Supplier confirmation pending.`;
    await supabase.from('crm_notes').insert({ lead_id: lead.id, author_user_id: null, body: noteBody });

    res.status(201).json({
      success: true,
      data: {
        hotelBookingId: booking.id,
        hotelCode: booking.hotel_code,
        leadId: lead.id,
        leadCode: lead.lead_code,
        status: booking.status,
        message: 'Hotel request received and added to CRM.'
      }
    });
  } catch (error) {
    if (createdLeadId) {
      try { await supabase.from('crm_leads').delete().eq('id', createdLeadId); } catch { /* best-effort rollback */ }
    }
    next(error);
  }
});

export default router;
export { router as hotelRouter };
