import express from 'express';
import adminController from './admin.controller.mjs';
import adminRepairController from './admin.repair.controller.mjs';
import adminDashboardV2Controller from './admin.dashboard-v2.controller.mjs';
import adminBackupController from './admin.backup.controller.mjs';
import adminBulkDeleteController from './admin.bulk-delete.controller.mjs';
import adminPassengerController from './admin.passenger.controller.mjs';
import adminBookingMutationController from './admin.booking-mutation.controller.mjs';
import adminEmailManualController from './admin.email-manual.controller.mjs';
import adminDemoController from './admin.demo.controller.mjs';
import adminAssistanceController from './admin.assistance.controller.mjs';
import voucherController from '../vouchers/voucher.controller.mjs';
import '../bookings/booking.repository.runtime-repair.mjs';
import '../bookings/booking.repository.egress-hardening.mjs';
import authenticate from '../../middleware/authenticate.mjs';
import authorize from '../../middleware/authorize.mjs';
import rateLimit from '../../middleware/rate-limit.mjs';

adminRepairController.bulkDeleteBookings = adminBulkDeleteController.bulkDeleteBookings;
adminRepairController.deleteBooking = adminBulkDeleteController.deleteBooking;

const router = express.Router();

const loginRateLimiter = rateLimit({ windowMs: 60000, maxRequests: 5, message: 'Too many admin login attempts. Please try again later.' });
const adminReadRateLimiter = rateLimit({ windowMs: 60000, maxRequests: 120, message: 'Too many admin read requests. Please wait a minute.' });
const adminWriteRateLimiter = rateLimit({ windowMs: 60000, maxRequests: 60, message: 'Too many admin changes. Please wait a minute.' });

router.post('/login', loginRateLimiter, adminController.login);
router.post('/demo-login', loginRateLimiter, adminDemoController.merchantDemoLogin);

import passengerAuthorizationController from '../authorizations/passenger-authorization.controller.mjs';
import bookingController from '../bookings/booking.controller.mjs';

router.post('/demo-workflow/merchant-credentials', adminWriteRateLimiter, authenticate, authorize(['admin']), adminDemoController.resetMerchantTestCredentials);

router.get('/vouchers', adminReadRateLimiter, authenticate, authorize(['admin']), voucherController.listAdmin);
router.post('/vouchers', adminWriteRateLimiter, authenticate, authorize(['admin']), voucherController.createAdmin);
router.patch('/vouchers/:id', adminWriteRateLimiter, authenticate, authorize(['admin']), voucherController.updateAdmin);
router.get('/vouchers/:id/redemptions', adminReadRateLimiter, authenticate, authorize(['admin']), voucherController.redemptionsAdmin);

router.post('/bookings/export', adminWriteRateLimiter, authenticate, authorize(['admin']), adminBackupController.exportBookingsBulk);
router.post('/bookings/bulk-delete', adminWriteRateLimiter, authenticate, authorize(['admin']), adminRepairController.bulkDeleteBookings);
router.post('/bookings/import-backup', adminWriteRateLimiter, authenticate, authorize(['admin']), adminController.importBookingBackup);
router.post('/bookings/operational-flags', adminReadRateLimiter, authenticate, authorize(['admin']), adminAssistanceController.getOperationalFlags);

router.get('/bookings', adminReadRateLimiter, authenticate, authorize(['admin']), adminController.getBookings);
router.get('/bookings/by-request/:clientRequestId', adminReadRateLimiter, authenticate, authorize(['admin']), adminController.getBookingByClientRequestId);
router.post('/bookings', adminWriteRateLimiter, authenticate, authorize(['admin']), adminController.createBooking);
router.post('/bookings/:id/email-preview', adminReadRateLimiter, authenticate, authorize(['admin']), adminController.emailPreview);
router.post('/bookings/:id/email-manual-sent', adminWriteRateLimiter, authenticate, authorize(['admin']), adminEmailManualController.markEmailManuallySent);
router.get('/bookings/:id/service-requests', adminReadRateLimiter, authenticate, authorize(['admin']), adminAssistanceController.getOperationalDetails);
router.patch('/bookings/:id/service-requests', adminWriteRateLimiter, authenticate, authorize(['admin']), adminAssistanceController.updateAssistance);
router.get('/bookings/:id', adminReadRateLimiter, authenticate, authorize(['admin']), adminController.getBookingDetail);
router.delete('/bookings/:id', adminWriteRateLimiter, authenticate, authorize(['admin']), adminRepairController.deleteBooking);

router.patch('/bookings/:id/status-notes', adminWriteRateLimiter, authenticate, authorize(['admin']), adminBookingMutationController.updateStatusNotes);
router.patch('/bookings/:id/status', adminWriteRateLimiter, authenticate, authorize(['admin']), bookingController.updateStatus);
router.patch('/bookings/:id/passenger-details', adminWriteRateLimiter, authenticate, authorize(['admin']), adminPassengerController.updatePassengerDetails);
router.patch('/bookings/:id/contact-details', adminWriteRateLimiter, authenticate, authorize(['admin']), adminBookingMutationController.updateContactDetails);
router.patch('/bookings/:id/itinerary', adminWriteRateLimiter, authenticate, authorize(['admin']), adminRepairController.updateItinerary);
router.patch('/bookings/:id/pricing', adminWriteRateLimiter, authenticate, authorize(['admin']), adminDashboardV2Controller.updatePricing);
router.patch('/bookings/:id/airline-details', adminWriteRateLimiter, authenticate, authorize(['admin']), adminBookingMutationController.saveTicketDetails);
router.patch('/bookings/:id/authorization', adminWriteRateLimiter, authenticate, authorize(['admin']), adminBookingMutationController.updateAuthorizationSettings);
router.patch('/bookings/:id/authorization-settings', adminWriteRateLimiter, authenticate, authorize(['admin']), adminBookingMutationController.updateAuthorizationSettings);
router.patch('/bookings/:id/payment', adminWriteRateLimiter, authenticate, authorize(['admin']), adminController.updatePaymentAuthorization);
router.patch('/bookings/:id/payment-authorization', adminWriteRateLimiter, authenticate, authorize(['admin']), adminController.updatePaymentAuthorization);
router.patch('/bookings/:id/billing-reference', adminWriteRateLimiter, authenticate, authorize(['admin']), adminController.updateBillingDetails);
router.patch('/bookings/:id/billing-details', adminWriteRateLimiter, authenticate, authorize(['admin']), adminController.updateBillingDetails);
router.post('/itineraries/parse', adminWriteRateLimiter, authenticate, authorize(['admin']), adminController.parseItinerary);
router.post('/parse-itinerary', adminWriteRateLimiter, authenticate, authorize(['admin']), adminController.parseItinerary);
router.post('/bookings/:id/import-itinerary', adminWriteRateLimiter, authenticate, authorize(['admin']), bookingController.importItineraryText);
router.patch('/bookings/:id/ticket', adminWriteRateLimiter, authenticate, authorize(['admin']), bookingController.updateTicket);
router.patch('/bookings/:id/notes', adminWriteRateLimiter, authenticate, authorize(['admin']), bookingController.updateNotes);
router.patch('/bookings/:id/restore', adminWriteRateLimiter, authenticate, authorize(['admin']), adminController.restoreBooking);

router.get('/bookings/:id/export', adminReadRateLimiter, authenticate, authorize(['admin']), adminController.exportBooking);
router.get('/bookings/:id/history', adminReadRateLimiter, authenticate, authorize(['admin']), adminController.getBookingHistory);
router.post('/bookings/:id/restore-snapshot', adminWriteRateLimiter, authenticate, authorize(['admin']), adminController.restoreFromSnapshot);

router.put('/bookings/:id/save-all', adminWriteRateLimiter, authenticate, authorize(['admin']), adminController.saveAllChanges);
router.put('/bookings/:id', adminWriteRateLimiter, authenticate, authorize(['admin']), adminController.updateBooking);
router.put('/bookings/:id/payment-splits', adminWriteRateLimiter, authenticate, authorize(['admin']), adminBookingMutationController.updatePaymentSplits);
router.patch('/bookings/:id/payment-splits', adminWriteRateLimiter, authenticate, authorize(['admin']), adminBookingMutationController.updatePaymentSplits);
router.put('/bookings/:id/ticket-details', adminWriteRateLimiter, authenticate, authorize(['admin']), adminBookingMutationController.saveTicketDetails);
router.post('/bookings/:id/send-final-ticket', adminWriteRateLimiter, authenticate, authorize(['admin']), adminController.sendFinalTicketEmail);
router.post('/bookings/:id/resend-admin-email', adminWriteRateLimiter, authenticate, authorize(['admin']), adminController.resendAdminAcknowledgement);
router.get('/bookings/:id/diagnostic', adminReadRateLimiter, authenticate, authorize(['admin']), adminController.getBookingDiagnosticData);
router.post('/bookings/:id/process-authorized', adminWriteRateLimiter, authenticate, authorize(['admin']), adminController.processAuthorizedBooking);

router.post('/bookings/:id/itinerary', adminWriteRateLimiter, authenticate, authorize(['admin']), adminRepairController.updateItinerary);
router.post('/bookings/:id/pricing', adminWriteRateLimiter, authenticate, authorize(['admin']), adminDashboardV2Controller.updatePricing);
router.post('/bookings/:identifier/pricing', adminWriteRateLimiter, authenticate, authorize(['admin']), adminDashboardV2Controller.updatePricing);
router.patch('/bookings/:identifier/pricing', adminWriteRateLimiter, authenticate, authorize(['admin']), adminDashboardV2Controller.updatePricing);
router.post('/bookings/:id/payment-action', adminWriteRateLimiter, authenticate, authorize(['admin']), adminController.handlePaymentAction);
router.get('/bookings/:id/authorization-evidence', adminReadRateLimiter, authenticate, authorize(['admin']), passengerAuthorizationController.getEvidenceExport);
router.get('/bookings/:id/authorization-pdf', adminReadRateLimiter, authenticate, authorize(['admin']), adminController.downloadAuthorizationPdf);
router.get('/stats', adminReadRateLimiter, authenticate, authorize(['admin']), adminController.getStats);
router.get('/analytics', adminReadRateLimiter, authenticate, authorize(['admin']), adminController.getAnalytics);
router.get('/abandoned-bookings', adminReadRateLimiter, authenticate, authorize(['admin']), adminController.getAbandonedBookings);

export default router;
export { router as adminRouter };
