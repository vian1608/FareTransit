import express from 'express';
import supabase from '../../integrations/supabase/supabase.client.mjs';
import { requirePermission } from './backoffice.middleware.mjs';
import backofficeStaffService from './backoffice.service.mjs';
import auditBackOffice from './backoffice.audit.mjs';
import {
  listCanonicalReservations,
  listCanonicalCustomers,
  resolveCanonicalEntity
} from '../reservations/canonical-reservation.service.mjs';

const router = express.Router();

const PERMISSION_BY_TYPE = {
  FLIGHT: 'bookings.flights.view',
  CAR: 'bookings.cars.view',
  HOTEL: 'bookings.hotels.view'
};

function hasAnyBookingPermission(staff) {
  return Object.values(PERMISSION_BY_TYPE).some(permission => backofficeStaffService.hasPermission(staff, permission));
}

function visibleByScope(staff, row, permission) {
  if (staff?.legacyOwner) return true;
  const scope = backofficeStaffService.scopeFor(staff, permission) || 'OWN';
  if (scope === 'ALL') return true;
  if (scope === 'TEAM') return Boolean(staff?.team?.id && row.team_id && row.team_id === staff.team.id);
  return Boolean(staff?.id && row.assigned_agent_id && row.assigned_agent_id === staff.id);
}

function visibleReservations(staff, rows) {
  return (rows || []).filter(row => {
    const permission = PERMISSION_BY_TYPE[row.serviceType];
    return permission && backofficeStaffService.hasPermission(staff, permission) && visibleByScope(staff, row, permission);
  });
}

function paymentRow(row) {
  return {
    id: row.id,
    confirmation_code: row.reference,
    booking_reference: row.reference,
    service_type: row.serviceType,
    passenger_name: row.customerName || 'Customer',
    customer_name: row.customerName || null,
    email: row.email || null,
    total_amount: row.total,
    currency: row.currency,
    payment_status: row.paymentStatus || 'PENDING',
    authorization_status: row.authorizationStatus || null,
    status: row.status,
    created_at: row.createdAt,
    payment_details: 'masked/server-side only'
  };
}

async function findCanonicalEntity({ serviceType, entityId, reference, bookingId }) {
  const explicit = String(serviceType || '').trim().toUpperCase();
  if (explicit) return resolveCanonicalEntity(explicit, { id: entityId || bookingId || null, code: reference || null });
  for (const type of ['FLIGHT', 'CAR', 'HOTEL']) {
    const found = await resolveCanonicalEntity(type, { id: entityId || bookingId || null, code: reference || null });
    if (found) return found;
  }
  return null;
}

router.get('/bookings/unified', async (req, res, next) => {
  try {
    if (!hasAnyBookingPermission(req.staff)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Booking view permission required.' } });
    }
    const rows = await listCanonicalReservations({
      serviceType: req.query.type,
      status: req.query.status,
      query: req.query.q,
      limit: Math.min(1000, Number(req.query.limit || 500))
    });
    const visible = visibleReservations(req.staff, rows);
    res.json({ success: true, data: visible, meta: { total: visible.length } });
  } catch (error) { next(error); }
});

router.get('/dashboard/summary', requirePermission('dashboard.view'), async (req, res, next) => {
  try {
    const rows = visibleReservations(req.staff, await listCanonicalReservations({ limit: 1000 }));
    const completed = new Set(['DONE', 'COMPLETED', 'TICKETED', 'BOOKED', 'CONFIRMED', 'CANCELLED', 'CANCELED']);
    const paid = rows.filter(row => String(row.paymentStatus || '').toUpperCase() === 'PAID');
    const metrics = {
      bookingsTotal: rows.length,
      flightBookings: rows.filter(row => row.serviceType === 'FLIGHT').length,
      carBookings: rows.filter(row => row.serviceType === 'CAR').length,
      hotelBookings: rows.filter(row => row.serviceType === 'HOTEL').length,
      needsAction: rows.filter(row => !completed.has(String(row.status || '').toUpperCase())).length,
      authorizationPending: rows.filter(row => row.serviceType === 'CAR' && !['NONE', 'AUTHORIZED', 'DECLINED', 'EXPIRED'].includes(String(row.authorizationStatus || 'NONE').toUpperCase())).length,
      paymentsPending: rows.filter(row => String(row.paymentStatus || 'PENDING').toUpperCase() === 'PENDING').length
    };
    const revenue = paid.reduce((sum, row) => sum + Number(row.total || 0), 0);
    res.json({
      success: true,
      data: {
        role: req.staff.role,
        metrics,
        finance: { revenue, grossSales: revenue, sales: revenue, salesThisMonth: revenue },
        recentBookings: rows.slice(0, 12)
      }
    });
  } catch (error) { next(error); }
});

router.get('/crm/customers', requirePermission('crm.customers.view'), async (req, res, next) => {
  try {
    const customers = await listCanonicalCustomers({ limit: 1000 });
    const visible = customers.map(customer => {
      const bookings = visibleReservations(req.staff, customer.bookings.map(item => ({
        ...item,
        customerName: customer.name,
        email: customer.email,
        phone: customer.phone,
        assigned_agent_id: item.assigned_agent_id,
        team_id: item.team_id
      })));
      if (!req.staff?.legacyOwner && !bookings.length) return null;
      const parts = String(customer.name || '').trim().split(/\s+/);
      return {
        ...customer,
        id: customer.email || customer.id,
        first_name: parts[0] || customer.name || 'Customer',
        last_name: parts.slice(1).join(' '),
        status: customer.latestBooking?.status || 'CUSTOMER',
        destination: customer.latestBooking?.destination || null,
        estimated_value: customer.totalValue,
        bookings
      };
    }).filter(Boolean);
    res.json({ success: true, data: visible });
  } catch (error) { next(error); }
});

router.get('/payments', requirePermission('payments.view'), async (req, res, next) => {
  try {
    let rows = visibleReservations(req.staff, await listCanonicalReservations({ limit: 1000 }));
    if (req.query.status) rows = rows.filter(row => String(row.paymentStatus || '').toUpperCase() === String(req.query.status).toUpperCase());
    res.json({ success: true, data: rows.map(paymentRow) });
  } catch (error) { next(error); }
});

router.get('/payments/refunds', requirePermission('payments.view'), async (req, res, next) => {
  try {
    const result = await supabase
      .from('refund_requests')
      .select('id,booking_id,entity_type,entity_id,entity_code,amount,currency,reason,status,requested_by,approved_by,processed_by,created_at,approved_at,processed_at')
      .order('created_at', { ascending: false })
      .limit(250);
    if (result.error) throw result.error;
    res.json({ success: true, data: result.data || [] });
  } catch (error) { next(error); }
});

router.post('/payments/refunds', requirePermission('payments.refund'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const amount = Number(body.amount || 0);
    if ((!body.bookingId && !body.entityId && !body.reference) || !body.reason || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_REFUND', message: 'A booking reference/id, positive amount and reason are required.' } });
    }

    const entity = await findCanonicalEntity({
      serviceType: body.serviceType || body.entityType,
      entityId: body.entityId,
      reference: body.reference || body.entityCode,
      bookingId: body.bookingId
    });
    if (!entity) return res.status(404).json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found.' } });

    const permission = PERMISSION_BY_TYPE[entity.serviceType];
    if (!permission || !backofficeStaffService.hasPermission(req.staff, permission) || !visibleByScope(req.staff, entity, permission)) {
      return res.status(404).json({ success: false, error: { code: 'BOOKING_NOT_FOUND', message: 'Booking not found in your scope.' } });
    }

    const setting = await supabase.from('backoffice_settings').select('value').eq('key', 'refund_large_threshold').maybeSingle();
    if (setting.error) throw setting.error;
    const threshold = Number(setting.data?.value ?? 500);
    if (amount > threshold && !backofficeStaffService.hasPermission(req.staff, 'payments.refund_large')) {
      return res.status(403).json({ success: false, error: { code: 'REFUND_APPROVAL_REQUIRED', message: `Refunds above ${threshold} require elevated finance permission` } });
    }
    if (amount > Number(entity.total || 0) && Number(entity.total || 0) > 0) {
      return res.status(400).json({ success: false, error: { code: 'REFUND_EXCEEDS_BOOKING_TOTAL', message: 'Refund amount cannot exceed the booking total.' } });
    }

    const result = await supabase.from('refund_requests').insert({
      booking_id: entity.serviceType === 'FLIGHT' ? entity.id : null,
      entity_type: entity.serviceType,
      entity_id: entity.id,
      entity_code: entity.reference,
      amount,
      currency: body.currency || entity.currency || 'USD',
      reason: body.reason,
      requested_by: req.staff.id || null,
      status: req.staff.legacyOwner ? 'APPROVED' : 'REQUESTED',
      approved_by: req.staff.legacyOwner ? req.staff.id : null,
      approved_at: req.staff.legacyOwner ? new Date().toISOString() : null
    }).select('*').single();
    if (result.error) throw result.error;
    await auditBackOffice(req, 'refund.requested', 'refund', result.data.id, { serviceType: entity.serviceType, entityId: entity.id, reference: entity.reference, amount, currency: result.data.currency });
    res.status(201).json({ success: true, data: result.data });
  } catch (error) { next(error); }
});

router.patch('/payments/refunds/:id', requirePermission('payments.refund_large'), async (req, res, next) => {
  try {
    const status = String(req.body?.status || '').toUpperCase();
    if (!['APPROVED', 'REJECTED', 'PROCESSED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_REFUND_STATUS', message: 'Unsupported refund status' } });
    }
    const update = { status };
    if (status === 'APPROVED') { update.approved_by = req.staff.id || null; update.approved_at = new Date().toISOString(); }
    if (status === 'PROCESSED') { update.processed_by = req.staff.id || null; update.processed_at = new Date().toISOString(); }
    const result = await supabase.from('refund_requests').update(update).eq('id', req.params.id).select('*').maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Refund request not found' } });
    await auditBackOffice(req, `refund.${status.toLowerCase()}`, 'refund', result.data.id, { entityType: result.data.entity_type, entityId: result.data.entity_id, amount: result.data.amount });
    res.json({ success: true, data: result.data });
  } catch (error) { next(error); }
});

export default router;
export { router as canonicalOperationsRouter };
