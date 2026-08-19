const isBookingDetail = path => /^\/bookings\/[^/]+/.test(path);

export const legacyAdminPermissionForRequest = (req) => {
  const path = req.path || ''; const method = req.method || 'GET';
  if (path === '/stats') return 'dashboard.view';
  if (path === '/analytics') return 'reports.view';
  if (path.includes('/export') || path.includes('/import-backup') || path.includes('/bulk-delete') || path.includes('/restore-snapshot') || path.includes('/diagnostic') || path.startsWith('/vouchers')) return null;
  if (path === '/bookings' && method === 'POST') return 'bookings.flights.create';
  if (path === '/bookings' && method === 'GET') return null;
  if (!isBookingDetail(path)) return null;
  if (method === 'GET') {
    if (path.includes('authorization-evidence') || path.includes('authorization-pdf')) return 'authorization.view';
    return 'bookings.flights.view';
  }
  if (path.includes('send-final-ticket')) return 'ticketing.send';
  if (path.includes('/ticket') || path.includes('airline-details')) return 'ticketing.update';
  if (path.includes('/authorization')) return 'authorization.send';
  if (path.includes('payment-action')) return String(req.body?.action || '').toLowerCase().includes('refund') ? 'payments.refund' : 'payments.request';
  if (method === 'DELETE') return 'bookings.flights.cancel';
  return 'bookings.flights.edit';
};

export default legacyAdminPermissionForRequest;
