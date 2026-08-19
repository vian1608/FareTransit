import express from 'express';
import supabase from '../../integrations/supabase/supabase.client.mjs';
import { applyScope, requirePermission } from './backoffice.middleware.mjs';
import backofficeStaffService from './backoffice.service.mjs';
import backofficeRepository from './backoffice.repository.mjs';
import auditBackOffice from './backoffice.audit.mjs';

const router = express.Router();
const scoped = (req, q, permission, columns) => applyScope(q, req.staff, backofficeStaffService.scopeFor(req.staff, permission) || 'ALL', columns);
const count = async q => { const { count: total, error } = await q; if (error) throw error; return total || 0; };

router.get('/dashboard/summary', requirePermission('dashboard.view'), async (req, res, next) => {
  try {
    const queries = [];
    const labels = [];
    if (backofficeStaffService.hasPermission(req.staff, 'crm.leads.view')) {
      labels.push('newLeads','followUps');
      queries.push(count(scoped(req, supabase.from('crm_leads').select('id',{count:'exact',head:true}).eq('status','NEW'),'crm.leads.view')));
      queries.push(count(scoped(req, supabase.from('crm_leads').select('id',{count:'exact',head:true}).not('next_follow_up_at','is',null).lte('next_follow_up_at',new Date().toISOString()).not('status','in','(LOST,CANCELLED,TRAVEL_COMPLETED)'),'crm.leads.view')));
    }
    if (backofficeStaffService.hasPermission(req.staff, 'crm.tasks.view')) {
      labels.push('overdueTasks');
      queries.push(count(scoped(req, supabase.from('crm_tasks').select('id',{count:'exact',head:true}).lt('due_at',new Date().toISOString()).neq('status','COMPLETED'),'crm.tasks.view',{ownerColumn:'assigned_to',teamColumn:'team_id'})));
    }
    if (backofficeStaffService.hasPermission(req.staff, 'bookings.flights.view')) {
      labels.push('flightBookings');
      queries.push(count(scoped(req, supabase.from('bookings').select('id',{count:'exact',head:true}).neq('status','CANCELLED'),'bookings.flights.view')));
    }
    if (backofficeStaffService.hasPermission(req.staff, 'bookings.hotels.view')) {
      labels.push('hotelsNeedingAction');
      queries.push(count(scoped(req, supabase.from('hotel_bookings').select('id',{count:'exact',head:true}).in('status',['REQUESTED','QUOTED','CUSTOMER_APPROVED','BOOKING_IN_PROGRESS']),'bookings.hotels.view')));
    }
    if (backofficeStaffService.hasPermission(req.staff, 'bookings.cars.view')) {
      labels.push('carsNeedingAction');
      queries.push(count(scoped(req, supabase.from('car_bookings').select('id',{count:'exact',head:true}).in('status',['REQUESTED','QUOTED','CUSTOMER_APPROVED','BOOKING_IN_PROGRESS']),'bookings.cars.view')));
    }
    if (backofficeStaffService.hasPermission(req.staff, 'payments.view')) {
      labels.push('paymentsPending');
      queries.push(count(scoped(req, supabase.from('bookings').select('id',{count:'exact',head:true}).eq('payment_status','pending'),'payments.view')));
    }
    const values = await Promise.all(queries);
    const metrics = Object.fromEntries(labels.map((label,index)=>[label,values[index]]));
    let finance = null;
    if (backofficeStaffService.hasPermission(req.staff,'finance.view')) {
      let q = supabase.from('finance_entries').select('sale_amount,markup,expected_commission,received_commission,refund_amount').gte('created_at',new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString());
      q = scoped(req,q,'finance.view');
      const { data, error } = await q; if (error) throw error;
      const rows = data || []; const sum = key => rows.reduce((a,row)=>a+Number(row[key]||0),0);
      finance = { salesThisMonth:sum('sale_amount'), markup:sum('markup'), expectedCommission:sum('expected_commission'), receivedCommission:sum('received_commission'), refunds:sum('refund_amount') };
    }
    res.json({ success:true, data:{ role:req.staff.role, metrics, finance } });
  } catch (error) { next(error); }
});

router.get('/payments', requirePermission('payments.view'), async (req,res,next)=>{
  try {
    let q=supabase.from('bookings').select('id,confirmation_code,passenger_name,email,total_amount,currency,payment_status,status,assigned_agent_id,team_id,created_at').order('created_at',{ascending:false});
    q=scoped(req,q,'payments.view');
    if(req.query.status)q=q.eq('payment_status',req.query.status);
    const{data,error}=await q.limit(250);if(error)throw error;
    res.json({success:true,data:(data||[]).map(row=>({...row,payment_details:'masked/server-side only'}))});
  }catch(e){next(e);}
});

router.get('/reports', requirePermission('reports.view'), async (req,res,next)=>{
  try {
    const from=req.query.from||new Date(Date.now()-30*86400000).toISOString();
    const to=req.query.to||new Date().toISOString();
    const result={from,to};
    if(backofficeStaffService.hasPermission(req.staff,'crm.leads.view')){
      let q=supabase.from('crm_leads').select('status,estimated_value,assigned_agent_id,team_id').gte('created_at',from).lte('created_at',to);q=scoped(req,q,'crm.leads.view');const{data,error}=await q;if(error)throw error;const rows=data||[];result.leads={total:rows.length,byStatus:rows.reduce((acc,row)=>({...acc,[row.status]:(acc[row.status]||0)+1}),{}),estimatedPipeline:rows.reduce((a,row)=>a+Number(row.estimated_value||0),0)};
    }
    if(backofficeStaffService.hasPermission(req.staff,'finance.view')){
      let q=supabase.from('finance_entries').select('sale_amount,supplier_cost,markup,expected_commission,received_commission,refund_amount,team_id,assigned_agent_id').gte('created_at',from).lte('created_at',to);q=scoped(req,q,'finance.view');const{data,error}=await q;if(error)throw error;const rows=data||[];const sum=k=>rows.reduce((a,r)=>a+Number(r[k]||0),0);result.finance={sales:sum('sale_amount'),supplierCost:sum('supplier_cost'),markup:sum('markup'),expectedCommission:sum('expected_commission'),receivedCommission:sum('received_commission'),refunds:sum('refund_amount')};
    }
    res.json({success:true,data:result});
  }catch(e){next(e);}
});

router.get('/crm/leads/:id/activity', requirePermission('crm.leads.view'), async(req,res,next)=>{
  try{
    let lead=supabase.from('crm_leads').select('id').eq('id',req.params.id);lead=scoped(req,lead,'crm.leads.view');const found=await lead.maybeSingle();if(found.error)throw found.error;if(!found.data)return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Lead not found in your scope'}});
    const[audit,notes,tasks]=await Promise.all([
      supabase.from('audit_logs').select('id,action,actor,metadata,created_at').eq('entity_type','lead').eq('entity_id',req.params.id).order('created_at',{ascending:false}).limit(100),
      supabase.from('crm_notes').select('id,body,author_user_id,created_at').eq('lead_id',req.params.id).order('created_at',{ascending:false}).limit(100),
      supabase.from('crm_tasks').select('id,title,status,due_at,completed_at,created_at').eq('lead_id',req.params.id).order('created_at',{ascending:false}).limit(100)
    ]);
    if(audit.error)throw audit.error;if(notes.error)throw notes.error;if(tasks.error)throw tasks.error;
    const timeline=[...(audit.data||[]).map(x=>({type:'audit',at:x.created_at,label:x.action,actor:x.actor,metadata:x.metadata})),...(notes.data||[]).map(x=>({type:'note',at:x.created_at,label:'Note added',body:x.body})),...(tasks.data||[]).map(x=>({type:'task',at:x.completed_at||x.created_at,label:`Task ${x.status.toLowerCase()}: ${x.title}`,dueAt:x.due_at}))].sort((a,b)=>new Date(b.at)-new Date(a.at));
    res.json({success:true,data:timeline});
  }catch(e){next(e);}
});

router.get('/settings/audit-logs', requirePermission('admin.audit_logs'), async(req,res,next)=>{try{let q=supabase.from('audit_logs').select('id,booking_id,actor_user_id,actor,action,entity_type,entity_id,metadata,ip_address,user_agent,created_at').order('created_at',{ascending:false});if(req.query.entityType)q=q.eq('entity_type',req.query.entityType);const{data,error}=await q.limit(500);if(error)throw error;res.json({success:true,data:data||[]});}catch(e){next(e);}});
router.get('/settings/integrations', requirePermission('admin.integrations'), (req,res)=>res.json({success:true,data:{serverOnly:true,secretsExposed:false,message:'Integration credentials remain in secure server environment configuration and are never returned by this API.'}}));
router.get('/settings/security', requirePermission('admin.settings'), (req,res)=>res.json({success:true,data:{backendPermissions:true,dataScopes:['OWN','TEAM','ALL'],rawCardStorage:false,auditLogging:true,destructiveAdminOperations:'owner-only'}}));

router.get('/team/permissions',requirePermission('team.view'),async(req,res,next)=>{try{res.json({success:true,data:await backofficeRepository.listPermissions()});}catch(e){next(e);}});
router.get('/team/roles/:id/permissions',requirePermission('team.view'),async(req,res,next)=>{try{res.json({success:true,data:await backofficeRepository.permissionsForRole(req.params.id)});}catch(e){next(e);}});
router.post('/team/teams',requirePermission('team.manage'),async(req,res,next)=>{try{const name=String(req.body?.name||'').trim();if(!name)return res.status(400).json({success:false,error:{code:'INVALID_TEAM',message:'Team name is required'}});const{data,error}=await supabase.from('teams').insert({name,status:'active'}).select('*').single();if(error)throw error;await auditBackOffice(req,'team.created','team',data.id,{name:data.name});res.status(201).json({success:true,data});}catch(e){next(e);}});
router.patch('/team/users/:id',requirePermission('team.manage'),async(req,res,next)=>{try{const b=req.body||{};if(req.staff.id&&req.staff.id===req.params.id&&(b.roleId!==undefined||b.status!==undefined))return res.status(400).json({success:false,error:{code:'SELF_PERMISSION_CHANGE_BLOCKED',message:'Users cannot change their own role or account status'}});const update={};if(b.name!==undefined)update.name=b.name;if(b.roleId!==undefined)update.role_id=b.roleId;if(b.teamId!==undefined)update.team_id=b.teamId||null;if(b.status!==undefined)update.status=b.status;const data=await backofficeRepository.updateStaff(req.params.id,update);await auditBackOffice(req,'staff.updated','staff_user',req.params.id,{fields:Object.keys(update)});res.json({success:true,data});}catch(e){next(e);}});
router.put('/team/roles/:id/permissions',requirePermission('team.manage'),async(req,res,next)=>{try{const grants=Array.isArray(req.body?.grants)?req.body.grants:[];const role=await supabase.from('staff_roles').select('id,key').eq('id',req.params.id).maybeSingle();if(role.error)throw role.error;if(!role.data)return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Role not found'}});if(role.data.key==='owner')return res.status(400).json({success:false,error:{code:'OWNER_ROLE_PROTECTED',message:'Owner permissions are protected from normal role editing'}});const ids=grants.map(g=>g.permissionId).filter(Boolean);if(ids.length){const valid=await supabase.from('permissions').select('id').in('id',ids);if(valid.error)throw valid.error;if((valid.data||[]).length!==new Set(ids).size)return res.status(400).json({success:false,error:{code:'INVALID_PERMISSION',message:'One or more permissions are invalid'}});}const del=await supabase.from('role_permissions').delete().eq('role_id',req.params.id);if(del.error)throw del.error;if(grants.length){const rows=grants.map(g=>({role_id:req.params.id,permission_id:g.permissionId,data_scope:['OWN','TEAM','ALL'].includes(g.scope)?g.scope:'ALL'}));const ins=await supabase.from('role_permissions').insert(rows);if(ins.error)throw ins.error;}await auditBackOffice(req,'role.permissions_updated','staff_role',req.params.id,{grantCount:grants.length});res.json({success:true,data:await backofficeRepository.permissionsForRole(req.params.id)});}catch(e){next(e);}});

export default router;
export { router as adminReportingRouter };
