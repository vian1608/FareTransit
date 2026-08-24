import addonService from './addon.service.mjs';

export const addonController = {
  listAdminByBooking: async (req, res, next) => {
    try {
      const data = await addonService.listAdminByBookingId(req.params.bookingId);
      return res.json({ success: true, data });
    } catch (error) { next(error); }
  },

  getPublicOffer: async (req, res, next) => {
    try {
      const offer = await addonService.getPublicOffer(req.params.token);
      if (!offer) return res.status(404).json({ success: false, error: { code: 'ADDON_OFFER_NOT_FOUND', message: 'Baggage offer not found.' } });
      return res.json({ success: true, data: offer });
    } catch (error) { next(error); }
  },

  getPaymentConfig: async (_req, res, next) => {
    try {
      return res.json({ success: true, data: await addonService.getPaymentConfig() });
    } catch (error) { next(error); }
  },

  createPayPalOrder: async (req, res, next) => {
    try {
      const data = await addonService.createPayPalOrder(req.params.token);
      return res.json({ success: true, data });
    } catch (error) { next(error); }
  },

  capturePayPalOrder: async (req, res, next) => {
    try {
      const data = await addonService.capturePayPalOrder(req.params.token, req.body?.paypalOrderId || req.body?.orderId);
      return res.json({ success: true, data, message: 'Baggage payment received. We are completing the baggage purchase.' });
    } catch (error) { next(error); }
  },

  declinePublicOffer: async (req, res, next) => {
    try {
      const request = await addonService.declineOffer(req.params.token);
      return res.json({ success: true, data: request, message: 'Baggage request declined.' });
    } catch (error) { next(error); }
  },

  quoteRequest: async (req, res, next) => {
    try {
      const request = await addonService.quoteRequest(req.params.id, req.body || {});
      return res.json({ success: true, data: request, message: 'Baggage price confirmed.' });
    } catch (error) { next(error); }
  },

  sendOffer: async (req, res, next) => {
    try {
      const request = await addonService.sendOffer(req.params.id);
      return res.json({ success: true, data: request, message: 'Baggage offer sent.' });
    } catch (error) { next(error); }
  },

  updateStatus: async (req, res, next) => {
    try {
      const request = await addonService.updateStatus(req.params.id, req.body?.status);
      return res.json({ success: true, data: request });
    } catch (error) { next(error); }
  },

  recordPayment: async (req, res, next) => {
    try {
      const result = await addonService.recordPayment(req.params.id, req.body || {});
      return res.json({ success: true, data: result, message: 'Baggage payment recorded.' });
    } catch (error) { next(error); }
  },

  recordFulfillment: async (req, res, next) => {
    try {
      const result = await addonService.recordFulfillment(req.params.id, req.body || {});
      return res.json({ success: true, data: result, message: 'Baggage fulfillment updated.' });
    } catch (error) { next(error); }
  }
};

export default addonController;
