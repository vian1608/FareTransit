import enterpriseRentalService from './enterprise-rental.service.mjs';
import nmiCarPaymentService from './nmi-car-payment.service.mjs';
import supabase from '../../config/supabase.mjs';
import logger from '../../config/logger.mjs';

function sendError(res, error) {
  return res.status(error.statusCode || 500).json({
    success: false,
    error: {
      code: error.code || 'ENTERPRISE_RENTAL_ERROR',
      message: error.statusCode && error.statusCode < 500 ? error.message : (error.message || 'Unable to complete the rental request.')
    }
  });
}

export const enterpriseRentalController = {
  locations: async (req, res) => {
    try {
      const data = await enterpriseRentalService.searchLocations(req.query.q || req.query.query, req.query.country_code || 'US');
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error);
    }
  },

  vehicles: async (req, res) => {
    try {
      const data = await enterpriseRentalService.searchVehicles(req.method === 'GET' ? req.query : req.body);
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error);
    }
  },

  createQuote: async (req, res) => {
    try {
      const data = await enterpriseRentalService.createQuote(req.body || {});
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return sendError(res, error);
    }
  },

  getQuote: async (req, res) => {
    try {
      const data = await enterpriseRentalService.getQuote(req.params.quoteToken);
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error);
    }
  },

  createOrder: async (req, res) => {
    try {
      const data = await enterpriseRentalService.createOrder(req.body || {});
      return res.status(201).json({ success: true, data });
    } catch (error) {
      return sendError(res, error);
    }
  },

  getOrder: async (req, res) => {
    try {
      const data = await enterpriseRentalService.getOrderByPublicToken(req.params.publicToken);
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error);
    }
  },

  paymentConfig: async (req, res) => {
    const cfg = nmiCarPaymentService.config();
    return res.json({
      success: true,
      data: {
        configured: cfg.configured,
        environment: cfg.environment,
        publicTokenizationKey: cfg.publicTokenizationKey || null,
        provider: 'nmi'
      }
    });
  },

  authorizeOrder: async (req, res) => {
    const publicToken = String(req.params.publicToken || '').trim();
    try {
      const { data: current, error: readError } = await supabase.from('car_rental_orders').select('*').eq('public_token', publicToken).maybeSingle();
      if (readError || !current) {
        const error = new Error('Rental order was not found.');
        error.statusCode = 404;
        error.code = 'ORDER_NOT_FOUND';
        throw error;
      }
      if (current.payment_status === 'authorized' || current.payment_status === 'captured') {
        return res.json({ success: true, data: enterpriseRentalService.publicOrder(current) });
      }

      const { data: locked, error: lockError } = await supabase
        .from('car_rental_orders')
        .update({ payment_status: 'authorizing', updated_at: new Date().toISOString() })
        .eq('public_token', publicToken)
        .eq('payment_status', 'not_started')
        .select('*')
        .maybeSingle();
      if (lockError) throw lockError;
      if (!locked) {
        const error = new Error('Payment authorization is already in progress. Please wait and refresh.');
        error.statusCode = 409;
        error.code = 'PAYMENT_IN_PROGRESS';
        throw error;
      }

      try {
        const gateway = await nmiCarPaymentService.authorize({
          paymentToken: req.body?.paymentToken,
          amount: Number(locked.amount),
          currency: locked.currency,
          customer: locked.customer || {},
          billing: locked.billing || {},
          orderReference: locked.order_reference
        });
        const paymentId = gateway.id || gateway.transaction_id || gateway.transactionid;
        if (!paymentId) {
          const error = new Error('Payment gateway did not return an authorization ID.');
          error.statusCode = 502;
          error.code = 'NMI_INVALID_RESPONSE';
          throw error;
        }
        const updated = await enterpriseRentalService.updateOrder(locked.order_reference, {
          status: 'awaiting_manual_booking',
          payment_status: 'authorized',
          nmi_payment_id: String(paymentId),
          nmi_authorization_code: gateway.authorization_code || gateway.authcode || null,
          admin_action_required: 'book_enterprise',
          authorized_at: new Date().toISOString()
        });
        return res.json({ success: true, data: enterpriseRentalService.publicOrder(updated) });
      } catch (paymentError) {
        await supabase.from('car_rental_orders').update({ payment_status: 'not_started', updated_at: new Date().toISOString() }).eq('public_token', publicToken).eq('payment_status', 'authorizing');
        throw paymentError;
      }
    } catch (error) {
      logger.warn(`[EnterpriseRental] authorization failed: ${error.message}`);
      return sendError(res, error);
    }
  },

  adminListOrders: async (req, res) => {
    try {
      const data = await enterpriseRentalService.listOrders({ status: req.query.status, limit: req.query.limit });
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error);
    }
  },

  adminGetOrder: async (req, res) => {
    try {
      const row = await enterpriseRentalService.getOrderByReference(req.params.reference);
      return res.json({
        success: true,
        data: {
          ...enterpriseRentalService.publicOrder(row),
          customer: row.customer,
          billing: row.billing,
          nmiPaymentId: row.nmi_payment_id || null,
          nmiAuthorizationCode: row.nmi_authorization_code || null,
          supplierCost: row.supplier_cost === null || row.supplier_cost === undefined ? null : Number(row.supplier_cost),
          grossMargin: row.gross_margin === null || row.gross_margin === undefined ? null : Number(row.gross_margin),
          adminActionRequired: row.admin_action_required || null
        }
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  adminConfirmAndCapture: async (req, res) => {
    try {
      const row = await enterpriseRentalService.getOrderByReference(req.params.reference);
      const supplierConfirmation = String(req.body?.supplierConfirmation || '').trim();
      const supplierCost = Number(req.body?.supplierCost);
      if (!supplierConfirmation) {
        const error = new Error('Enterprise confirmation number is required before capture.');
        error.statusCode = 400;
        error.code = 'SUPPLIER_CONFIRMATION_REQUIRED';
        throw error;
      }
      if (!Number.isFinite(supplierCost) || supplierCost < 0) {
        const error = new Error('A valid supplier cost is required.');
        error.statusCode = 400;
        error.code = 'SUPPLIER_COST_REQUIRED';
        throw error;
      }
      if (row.payment_status === 'captured') {
        return res.json({ success: true, data: enterpriseRentalService.publicOrder(row) });
      }
      if (row.payment_status !== 'authorized' || !row.nmi_payment_id) {
        const error = new Error('Customer payment must be authorized before confirming the supplier booking.');
        error.statusCode = 409;
        error.code = 'PAYMENT_NOT_AUTHORIZED';
        throw error;
      }

      const gateway = await nmiCarPaymentService.capture({ paymentId: row.nmi_payment_id, amount: Number(row.amount) });
      const margin = Number((Number(row.amount) - supplierCost).toFixed(2));
      const updated = await enterpriseRentalService.updateOrder(row.order_reference, {
        supplier_confirmation: supplierConfirmation,
        supplier_cost: Number(supplierCost.toFixed(2)),
        gross_margin: margin,
        status: 'confirmed',
        payment_status: 'captured',
        nmi_capture_id: String(gateway.id || gateway.transaction_id || gateway.transactionid || row.nmi_payment_id),
        admin_action_required: null,
        captured_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString()
      });
      return res.json({ success: true, data: { ...enterpriseRentalService.publicOrder(updated), supplierCost: Number(updated.supplier_cost), grossMargin: Number(updated.gross_margin) } });
    } catch (error) {
      logger.warn(`[EnterpriseRental] confirm/capture failed: ${error.message}`);
      return sendError(res, error);
    }
  },

  adminMarkBookingDetails: async (req, res) => {
    try {
      const row = await enterpriseRentalService.getOrderByReference(req.params.reference);
      const supplierConfirmation = String(req.body?.supplierConfirmation || '').trim();
      const supplierCostRaw = req.body?.supplierCost;
      const supplierCost = supplierCostRaw === '' || supplierCostRaw === undefined || supplierCostRaw === null ? null : Number(supplierCostRaw);
      if (supplierCost !== null && (!Number.isFinite(supplierCost) || supplierCost < 0)) {
        const error = new Error('Supplier cost must be a valid positive amount.');
        error.statusCode = 400;
        error.code = 'INVALID_SUPPLIER_COST';
        throw error;
      }
      const patch = {
        supplier_confirmation: supplierConfirmation || null,
        supplier_cost: supplierCost === null ? null : Number(supplierCost.toFixed(2)),
        gross_margin: supplierCost === null ? null : Number((Number(row.amount) - supplierCost).toFixed(2))
      };
      const updated = await enterpriseRentalService.updateOrder(row.order_reference, patch);
      return res.json({ success: true, data: { ...enterpriseRentalService.publicOrder(updated), supplierCost: updated.supplier_cost, grossMargin: updated.gross_margin } });
    } catch (error) {
      return sendError(res, error);
    }
  },

  adminMarkUnavailable: async (req, res) => {
    try {
      const row = await enterpriseRentalService.getOrderByReference(req.params.reference);
      if (row.payment_status === 'captured') {
        const error = new Error('This order has already been captured. Use the normal refund workflow instead.');
        error.statusCode = 409;
        error.code = 'ORDER_ALREADY_CAPTURED';
        throw error;
      }
      const needsVoid = row.payment_status === 'authorized' && Boolean(row.nmi_payment_id);
      const updated = await enterpriseRentalService.updateOrder(row.order_reference, {
        status: 'booking_failed',
        admin_action_required: needsVoid ? 'void_authorization_in_nmi' : null
      });
      return res.json({
        success: true,
        data: {
          ...enterpriseRentalService.publicOrder(updated),
          adminActionRequired: updated.admin_action_required || null,
          message: needsVoid
            ? 'Marked unavailable. Void the outstanding authorization in NMI before closing this order.'
            : 'Marked unavailable.'
        }
      });
    } catch (error) {
      return sendError(res, error);
    }
  }
};

export default enterpriseRentalController;
