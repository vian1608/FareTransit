import express from 'express';
import enquiryController from './enquiry.controller.mjs';

const router = express.Router();

router.post('/consulting', enquiryController.create);

export default router;
export { router as enquiryRouter };
