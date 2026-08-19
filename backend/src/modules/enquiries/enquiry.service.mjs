import enquiryRepository from './enquiry.repository.mjs';
import { sendConsultingInquiry } from '../../integrations/resend/resend.service.mjs';
import logger from '../../config/logger.mjs';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPORTED_SERVICE_TYPES = new Set([
  'flights',
  'senior-travel',
  'rail',
  'consulting-payment'
]);

export const enquiryService = {
  submitEnquiry: async (inquiryData) => {
    const { serviceType, name, email, origin, destination } = inquiryData || {};

    if (!serviceType || !SUPPORTED_SERVICE_TYPES.has(serviceType)) {
      const err = new Error('serviceType must be "flights", "senior-travel", "rail", or "consulting-payment"');
      err.code = 'INQUIRY_VALIDATION_FAILED';
      err.statusCode = 400;
      throw err;
    }

    if (!name?.trim() || !email?.trim() || !origin?.trim() || !destination?.trim()) {
      const err = new Error('Name, email, origin, and destination are required');
      err.code = 'INQUIRY_VALIDATION_FAILED';
      err.statusCode = 400;
      throw err;
    }

    if (!EMAIL_PATTERN.test(email.trim())) {
      const err = new Error('Please provide a valid email address');
      err.code = 'INQUIRY_VALIDATION_FAILED';
      err.statusCode = 400;
      throw err;
    }

    // 1. Database Persistence FIRST
    let savedRecord;
    try {
      savedRecord = await enquiryRepository.saveEnquiry(inquiryData);
    } catch (err) {
      logger.error('[EnquiryService] Persistence failure:', err.message);
      const error = new Error('We could not save your request right now. Please try again.');
      error.code = 'INQUIRY_PERSISTENCE_FAILED';
      error.statusCode = 500;
      throw error;
    }

    const leadId = savedRecord?.id;
    if (!leadId || savedRecord?.persisted !== true) {
      const error = new Error('Lead persistence verification failed');
      error.code = 'INQUIRY_PERSISTENCE_FAILED';
      error.statusCode = 500;
      throw error;
    }

    // 2. Email Notification SECOND (failure will not lose the lead)
    let emailResult = null;
    let emailed = false;
    let emailErrorMsg = null;

    try {
      emailResult = await sendConsultingInquiry({ ...inquiryData, leadId });
      emailed = true;
      await enquiryRepository.updateEmailStatus(leadId, {
        status: 'SENT',
        provider: emailResult?.provider || 'resend',
        messageId: emailResult?.messageId || null
      });
    } catch (mailErr) {
      emailErrorMsg = mailErr.message;
      logger.warn(`[EnquiryService] Lead ${leadId} persisted, but notification email failed:`, mailErr.message);
      await enquiryRepository.updateEmailStatus(leadId, {
        status: 'FAILED',
        error: mailErr.message
      });
    }

    return {
      success: true,
      persisted: true,
      leadId,
      emailed,
      messageId: emailResult?.messageId || null,
      message: 'Your request has been submitted successfully.',
      ...(emailErrorMsg ? { warning: 'Inquiry saved but notification email could not be delivered.' } : {})
    };
  }
};

export default enquiryService;
