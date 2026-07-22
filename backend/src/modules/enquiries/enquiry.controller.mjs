import enquiryService from './enquiry.service.mjs';

export const enquiryController = {
  create: async (req, res, next) => {
    try {
      const result = await enquiryService.submitEnquiry(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
};

export default enquiryController;
