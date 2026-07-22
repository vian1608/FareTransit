import { saveInquiryToFile } from '../../integrations/resend/resend.service.mjs';

export const enquiryRepository = {
  saveEnquiry: async (enquiryData) => {
    return saveInquiryToFile(enquiryData);
  }
};

export default enquiryRepository;
