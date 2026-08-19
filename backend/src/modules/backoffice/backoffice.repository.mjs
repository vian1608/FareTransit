import supabase from '../../integrations/supabase/supabase.client.mjs';

const normalizeStaff = row => row ? { ...row, role: row.staff_roles || row.role || null, team: row.teams || row.team || null } : null;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const backofficeRepository = {
  async findStaffByEmail(email) {
    const { data, error } = await supabase.from('staff_users').select('id,name,email,password_hash,status,team_id,role_id,last_login_at,staff_roles(id,key,name),teams(id,name)').ilike('email', String(email || '').trim()).maybeSingle();
    if (error) throw error;
    return normalizeStaff(data);
  },
  async findStaffById(id) {
    const { data, error } = await supabase.from('staff_users').select('id,name,email,status,team_id,role_id,last_login_at,staff_roles(id,key,name),teams(id,name)').eq('id', id).maybeSingle();
    if (error) throw error;
    return normalizeStaff(data);
  },
  async permissionsForRole(roleId) {
    const { data, error } = await supabase.from('role_permissions').select('data_scope,permissions(id,key,description)').eq('role_id', roleId);
    if (error) throw error;
    return (data || []).filter(item => item.permissions?.key).map(item => ({ id: item.permissions.id, key: item.permissions.key, description: item.permissions.description, scope: item.data_scope || 'ALL' }));
  },
  async touchLastLogin(id) {
    const { error } = await supabase.from('staff_users').update({ last_login_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },
  async listStaff() {
    const { data, error } = await supabase.from('staff_users').select('id,name,email,status,team_id,role_id,last_login_at,created_at,staff_roles(id,key,name),teams(id,name)').order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(normalizeStaff);
  },
  async listRoles() {
    const { data, error } = await supabase.from('staff_roles').select('id,key,name,description').order('name');
    if (error) throw error;
    return data || [];
  },
  async listTeams() {
    const { data, error } = await supabase.from('teams').select('id,name,status').order('name');
    if (error) throw error;
    return data || [];
  },
  async listPermissions() {
    const { data, error } = await supabase.from('permissions').select('id,key,description').order('key');
    if (error) throw error;
    return data || [];
  },
  async createStaff(payload) {
    const { data, error } = await supabase.from('staff_users').insert(payload).select('id').single();
    if (error) throw error;
    return data;
  },
  async updateStaff(id, payload) {
    const { data, error } = await supabase.from('staff_users').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select('id').single();
    if (error) throw error;
    return data;
  },
  async bookingInScope(identifier, profile, scope) {
    let q = supabase.from('bookings').select('id,confirmation_code,assigned_agent_id,team_id');
    q = UUID_RE.test(String(identifier || '')) ? q.eq('id', identifier) : q.eq('confirmation_code', identifier);
    if (scope === 'OWN') q = q.eq('assigned_agent_id', profile.id || '__none__');
    if (scope === 'TEAM') q = q.eq('team_id', profile.team?.id || '__none__');
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return data;
  }
};

export default backofficeRepository;
