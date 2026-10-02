import express from 'express';
import authenticate from '../../middleware/authenticate.mjs';
import { loadBackOfficeProfile, requirePermission } from './backoffice.middleware.mjs';
import backofficeRepository from './backoffice.repository.mjs';
import backofficeStaffService from './backoffice.service.mjs';
import { canonicalOperationsRouter } from './canonical-operations.routes.mjs';
import { crmRouter } from './crm.routes.mjs';
import { flightBridgeRouter } from './flight-bridge.routes.mjs';
import { tripsHotelsRouter } from './trips-hotels.routes.mjs';
import { carAuthorizationComposeRouter } from './car-authorization-compose.routes.mjs';
import { carEticketRouter } from './car-eticket.routes.mjs';
import { carsBackofficeFastRouter } from './cars-backoffice-fast.routes.mjs';
import { carsBackofficeRouter } from './cars-backoffice.routes.mjs';
import { financeSuppliersRouter } from './finance-suppliers.routes.mjs';
import { adminReportingRouter } from './admin-reporting.routes.mjs';
import { securePaymentAdminRouter } from './secure-payment-admin.routes.mjs';

const router = express.Router();
router.use(authenticate, loadBackOfficeProfile);
router.get('/me', (req,res)=>res.json({success:true,data:req.staff}));

// Canonical multi-service operations must be registered before the historical
// flight-centric reporting/CRM/payment handlers. Express uses the first matching
// route, so this guarantees Dashboard, Customers, Payments, Refunds and the
// unified booking feed all share the Flight/Car/Hotel reservation abstraction.
router.use('/', canonicalOperationsRouter);
router.use('/', adminReportingRouter);
router.get('/dashboard', requirePermission('dashboard.view'), (req,res)=>res.json({success:true,data:{profile:req.staff,scope:req.staff.role,modules:['crm','trips','bookings','payments','finance','suppliers','reports','team','settings']}}));
router.use('/crm', crmRouter);
router.use('/', flightBridgeRouter);
router.use('/', tripsHotelsRouter);
router.use('/', carAuthorizationComposeRouter);
router.use('/', carEticketRouter);
router.use('/', carsBackofficeFastRouter);
router.use('/', carsBackofficeRouter);
router.use('/', financeSuppliersRouter);
router.use('/', securePaymentAdminRouter);
router.get('/team/users',requirePermission('team.view'),async(req,res,next)=>{try{res.json({success:true,data:await backofficeRepository.listStaff()});}catch(e){next(e);}});
router.get('/team/roles',requirePermission('team.view'),async(req,res,next)=>{try{res.json({success:true,data:await backofficeRepository.listRoles()});}catch(e){next(e);}});
router.get('/team/teams',requirePermission('team.view'),async(req,res,next)=>{try{res.json({success:true,data:await backofficeRepository.listTeams()});}catch(e){next(e);}});
router.post('/team/users',requirePermission('team.manage'),async(req,res,next)=>{try{const{name,email,password,roleId,teamId,status}=req.body||{};if(!name||!email||!password||!roleId||password.length<10)return res.status(400).json({success:false,error:{code:'INVALID_STAFF_USER',message:'name, email, roleId and a password of at least 10 characters are required'}});res.status(201).json({success:true,data:await backofficeStaffService.createStaff({name,email,password,roleId,teamId,status})});}catch(e){next(e);}});
export default router;
export { router as backOfficeRouter };
