import express from 'express';
import abandonedBookingController from './abandoned-booking.controller.mjs';

const router = express.Router();

router.post('/', abandonedBookingController.save);
router.delete('/:sessionKey', abandonedBookingController.delete);

export default router;
export { router as abandonedBookingRouter };
