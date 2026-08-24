import flexAddonService from './flex-addon.service.mjs';

function fail(res, error) {
  return res.status(error?.status || 500).json({ success: false, error: { code: error?.code || 'FLEX_ASSIST_FAILED', message: error?.message || 'Unable to process Flex Assist request.' } });
}

export const flexAddonController = {
  createChangeRequest: async (req, res) => {
    try { return res.status(201).json({ success: true, data: await flexAddonService.createChangeRequest(req.params.reference, req.body || {}) }); }
    catch (error) { return fail(res, error); }
  },
  listCustomer: async (req, res) => {
    try { return res.json({ success: true, data: await flexAddonService.listCustomer(req.params.reference, req.query.email) }); }
    catch (error) { return fail(res, error); }
  },
  listAdmin: async (req, res) => {
    try { return res.json({ success: true, data: await flexAddonService.listAdmin(req.params.reference), statuses: flexAddonService.STATUSES }); }
    catch (error) { return fail(res, error); }
  },
  updateAdmin: async (req, res) => {
    try { return res.json({ success: true, data: await flexAddonService.updateChangeRequest(req.params.reference, req.params.changeRequestId, req.body || {}) }); }
    catch (error) { return fail(res, error); }
  },
};

export default flexAddonController;
