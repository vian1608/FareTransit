import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import env from '../../config/env.mjs';
import backofficeRepository from './backoffice.repository.mjs';

const MERCHANT_DEMO_EMAIL = 'merchant-test@faretransit.com';
const MERCHANT_DEMO_GRANTS = Object.freeze([
  { key: 'dashboard.view', scope: 'ALL' },
  { key: 'bookings.flights.view', scope: 'OWN' },
  { key: 'authorization.view', scope: 'OWN' },
  { key: 'payments.view', scope: 'OWN' },
  { key: 'ticketing.view', scope: 'OWN' }
]);

const profileShape = (staff, grants) => ({
  id: staff.id, name: staff.name, email: staff.email,
  role: staff.role?.key || 'staff', roleName: staff.role?.name || 'Staff',
  team: staff.team ? { id: staff.team.id, name: staff.team.name } : null,
  status: staff.status,
  permissions: grants.map(grant => grant.key),
  permissionScopes: Object.fromEntries(grants.map(grant => [grant.key, grant.scope || 'ALL']))
});

const demoProfileShape = staff => ({
  ...profileShape(staff, MERCHANT_DEMO_GRANTS),
  demoMode: true,
  roleName: 'Merchant Test Demo',
  notice: 'Read-only demo access. Only records assigned to the dedicated merchant-test account are in scope.'
});

export const backofficeStaffService = {
  legacyOwnerProfile(email) {
    return { id: null, name: 'Owner', email, role: 'owner', roleName: 'Owner / Super Admin', team: null, status: 'active', permissions: ['*'], permissionScopes: { '*': 'ALL' }, legacyOwner: true };
  },
  async login(email, password) {
    const staff = await backofficeRepository.findStaffByEmail(email);
    if (!staff || staff.status !== 'active' || !(await bcrypt.compare(password, staff.password_hash || ''))) {
      const err = new Error('Invalid email or password.'); err.statusCode = 401; err.code = 'INVALID_CREDENTIALS'; throw err;
    }
    const grants = await backofficeRepository.permissionsForRole(staff.role_id);
    const profile = profileShape(staff, grants);
    const token = jwt.sign({ staffUserId: staff.id, email: staff.email, role: 'staff' }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
    await backofficeRepository.touchLastLogin(staff.id);
    return { token, admin: profile };
  },
  async demoLogin() {
    const staff = await backofficeRepository.findStaffByEmail(MERCHANT_DEMO_EMAIL);
    if (!staff || staff.status !== 'active' || staff.role?.key !== 'merchant_test') {
      const err = new Error('Merchant demo account is not configured.'); err.statusCode = 503; err.code = 'MERCHANT_DEMO_UNAVAILABLE'; throw err;
    }
    const profile = demoProfileShape(staff);
    const token = jwt.sign(
      { staffUserId: staff.id, email: staff.email, role: 'staff', demoMode: true },
      env.jwtSecret,
      { expiresIn: '1h' }
    );
    await backofficeRepository.touchLastLogin(staff.id);
    return { token, admin: profile };
  },
  async profileFromToken(tokenUser) {
    if (tokenUser?.role === 'admin') return this.legacyOwnerProfile(tokenUser.email);
    if (tokenUser?.role !== 'staff' || !tokenUser.staffUserId) return null;
    const staff = await backofficeRepository.findStaffById(tokenUser.staffUserId);
    if (!staff || staff.status !== 'active') return null;
    if (tokenUser.demoMode === true) {
      if (String(staff.email || '').toLowerCase() !== MERCHANT_DEMO_EMAIL || staff.role?.key !== 'merchant_test') return null;
      return demoProfileShape(staff);
    }
    return profileShape(staff, await backofficeRepository.permissionsForRole(staff.role_id));
  },
  hasPermission(profile, permission) { return Boolean(profile && (profile.permissions?.includes('*') || profile.permissions?.includes(permission))); },
  scopeFor(profile, permission) { if (!profile) return null; if (profile.permissions?.includes('*')) return 'ALL'; return profile.permissionScopes?.[permission] || null; },
  async createStaff(input) {
    const hash = await bcrypt.hash(input.password, 12);
    return backofficeRepository.createStaff({ name: input.name, email: String(input.email).toLowerCase().trim(), password_hash: hash, role_id: input.roleId, team_id: input.teamId || null, status: input.status || 'active' });
  }
};

export default backofficeStaffService;
