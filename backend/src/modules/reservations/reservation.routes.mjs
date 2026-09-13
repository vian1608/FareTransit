import express from 'express';
import authenticate from '../../middleware/authenticate.mjs';
import authorize from '../../middleware/authorize.mjs';
import rateLimit from '../../middleware/rate-limit.mjs';
import controller from './reservation.controller.mjs';

const adminRouter = express.Router();
const publicRouter = express.Router();
const readLimit = rateLimit({ windowMs: 60000, maxRequests: 120, message: 'Too many reservation requests. Please wait a minute.' });
const writeLimit = rateLimit({ windowMs: 60000, maxRequests: 60, message: 'Too many reservation changes. Please wait a minute.' });
const publicLimit = rateLimit({ windowMs: 60000, maxRequests: 30, message: 'Too many authorization requests. Please wait a minute.' });

adminRouter.use(authenticate, authorize(['admin']));
adminRouter.get('/', readLimit, controller.list);
adminRouter.get('/authorizations', readLimit, controller.listAuthorizations);
adminRouter.get('/car-companies', readLimit, controller.companies);
adminRouter.post('/assets', writeLimit, controller.uploadAsset);
adminRouter.post('/car', writeLimit, controller.createCar);
adminRouter.get('/:reference', readLimit, controller.get);
adminRouter.patch('/:reference/car', writeLimit, controller.updateCar);
adminRouter.post('/:reference/authorization/draft', writeLimit, controller.saveDraft);
adminRouter.post('/:reference/authorization/revision', writeLimit, controller.createRevision);
adminRouter.post('/:reference/authorization/send', writeLimit, controller.send);
adminRouter.post('/:reference/booked', writeLimit, controller.markBooked);

publicRouter.get('/:token', publicLimit, controller.publicGet);
publicRouter.post('/:token/authorize', publicLimit, controller.publicAuthorize);

export { adminRouter as reservationAdminRouter, publicRouter as reservationAuthorizationPublicRouter };
