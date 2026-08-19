import voucherService from './voucher.service.mjs';

function sendError(res, error) {
  const status = Number(error?.status) || 500;
  return res.status(status).json({
    success: false,
    error: {
      code: error?.code || 'VOUCHER_REQUEST_FAILED',
      message: error?.message || 'Voucher request failed.',
    },
  });
}

export const voucherController = {
  validate: async (req, res) => {
    try {
      const result = await voucherService.validate(req.body || {});
      return res.json({ success: true, data: result });
    } catch (error) {
      return sendError(res, error);
    }
  },

  listAdmin: async (req, res) => {
    try {
      const vouchers = await voucherService.list();
      return res.json({ success: true, data: vouchers });
    } catch (error) {
      return sendError(res, error);
    }
  },

  createAdmin: async (req, res) => {
    try {
      const actor = req.user?.email || req.user?.username || req.user?.id || 'admin';
      const voucher = await voucherService.create(req.body || {}, actor);
      return res.status(201).json({ success: true, data: voucher });
    } catch (error) {
      return sendError(res, error);
    }
  },

  updateAdmin: async (req, res) => {
    try {
      const voucher = await voucherService.update(req.params.id, req.body || {});
      return res.json({ success: true, data: voucher });
    } catch (error) {
      return sendError(res, error);
    }
  },

  redemptionsAdmin: async (req, res) => {
    try {
      const redemptions = await voucherService.redemptions(req.params.id);
      return res.json({ success: true, data: redemptions });
    } catch (error) {
      return sendError(res, error);
    }
  },
};

export default voucherController;
