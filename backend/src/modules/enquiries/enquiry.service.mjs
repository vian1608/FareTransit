import { sendConsultingInquiry } from '../../integrations/resend/resend.service.mjs';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const enquiryService = {
  submitEnquiry: async (inquiryData) => {
    const { serviceType, name, email, origin, destination } = inquiryData;

    if (!serviceType || !['flights', 'rail', 'consulting-payment'].includes(serviceType)) {
      throw new Error('serviceType must be "flights", "rail", or "consulting-payment"');
    }

    if (!name?.trim() || !email?.trim() || !origin?.trim() || !destination?.trim()) {
      throw new Error('Name, email, origin, and destination are required');
    }

    if (!EMAIL_PATTERN.test(email.trim())) {
      throw new Error('Please provide a valid email address');
    }

    return sendConsultingInquiry(inquiryData);
  }
};

export default enquiryService;
