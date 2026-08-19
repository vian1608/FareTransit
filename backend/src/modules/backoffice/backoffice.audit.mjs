import supabase from '../../integrations/supabase/supabase.client.mjs';

export async function auditBackOffice(req, action, entityType, entityId, metadata = {}) {
  const safeMetadata = { ...metadata };
  for (const key of ['card','cardNumber','pan','cvv','password','password_hash','token','secret']) delete safeMetadata[key];
  const { error } = await supabase.from('audit_logs').insert({
    booking_id: entityType === 'booking' ? entityId : null,
    action,
    actor: req.staff?.email || req.user?.email || 'system',
    actor_user_id: req.staff?.id || null,
    entity_type: entityType,
    entity_id: entityId ? String(entityId) : null,
    metadata: safeMetadata,
    ip_address: req.ip || null,
    user_agent: req.get?.('user-agent') || null
  });
  if (error) console.warn('Back-office audit write failed:', error.message);
}

export default auditBackOffice;
