import bookingRepository from '../bookings/booking.repository.mjs';
import bookingPricingService from '../bookings/booking-pricing.service.mjs';
import logger from '../../config/logger.mjs';

export const adminDashboardV2Controller = {
  updatePricing: async (req, res) => {
    const bookingId = req.params.identifier || req.params.id;
    const requestId = req.headers['idempotency-key'] || req.body?.clientRequestId || `PRICE-${Date.now()}`;

    try {
      const {
        supplierFare,
        taxesAndFees,
        taxes,
        customerTotal,
        currency = 'USD',
        reason,
        bookingVersion,
        expectedVersion
      } = req.body || {};

      const supplier = Number(supplierFare);
      const feeTotal = Number(taxesAndFees ?? taxes ?? 0);
      const total = Number(customerTotal);
      const auditReason = String(reason || '').trim();

      if (!bookingId) {
        return res.status(400).json({ success: false, requestId, error: { code: 'INVALID_BOOKING_ID', message: 'A booking ID is required.' } });
      }
      if (!Number.isFinite(supplier) || supplier < 0) {
        return res.status(400).json({ success: false, requestId, error: { code: 'INVALID_SUPPLIER_FARE', message: 'Supplier fare must be a valid non-negative number.' } });
      }
      if (!Number.isFinite(feeTotal) || feeTotal < 0) {
        return res.status(400).json({ success: false, requestId, error: { code: 'INVALID_TAXES_AND_FEES', message: 'Taxes and fees must be a valid non-negative number.' } });
      }
      if (!Number.isFinite(total) || total <= 0) {
        return res.status(400).json({ success: false, requestId, error: { code: 'INVALID_CUSTOMER_TOTAL', message: 'Customer total must be greater than zero.' } });
      }
      if (!auditReason) {
        return res.status(400).json({ success: false, requestId, error: { code: 'REASON_REQUIRED', message: 'A reason is required for every pricing revision.' } });
      }

      const existing = await bookingRepository.resolveBooking(bookingId);
      const agencyMarkup = req.body?.agencyMarkup !== undefined
        ? Number(req.body.agencyMarkup)
        : total - supplier - feeTotal;

      // updatePricing owns persistence verification and finishes by calling
      // bookingRepository.getCompleteBookingById, so the controller returns the
      // verified read-after-write snapshot without issuing a duplicate DB read.
      const result = await bookingPricingService.updatePricing({
        bookingId: existing.id,
        supplierFare: supplier,
        taxesAndFees: feeTotal,
        agencyMarkup,
        customerTotal: total,
        currency: String(currency || 'USD').toUpperCase(),
        reason: auditReason,
        adminId: req.user?.email || req.user?.id || 'admin',
        expectedVersion: bookingVersion || expectedVersion || null
      });

      if (!result.booking) {
        return res.status(500).json({
          success: false,
          requestId,
          error: { code: 'PRICING_VERIFY_FAILED', message: 'Pricing was written but the updated booking could not be reloaded.' }
        });
      }

      return res.json({
        success: true,
        requestId,
        message: 'Pricing updated and verified successfully.',
        booking: result.booking,
        data: result.booking,
        pricing: result.pricing,
        persistenceVerified: true
      });
    } catch (error) {
      const status = error.status || (error.code === 'BOOKING_NOT_FOUND' ? 404 : error.code === 'BOOKING_VERSION_CONFLICT' ? 409 : 400);
      logger.error(`[AdminDashboardV2] Pricing update failed for ${bookingId}: ${error.message}`);
      return res.status(status).json({
        success: false,
        requestId,
        error: {
          code: error.code || 'PRICING_UPDATE_FAILED',
          message: error.message
        }
      });
    }
  }
};

export default adminDashboardV2Controller;
