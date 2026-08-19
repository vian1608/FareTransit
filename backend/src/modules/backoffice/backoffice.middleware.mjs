import backofficeStaffService from './backoffice.service.mjs';

export const loadBackOfficeProfile = async (req, res, next) => {
  try {
    const profile = await backofficeStaffService.profileFromToken(req.user);
    if (!profile) return res.status(403).json({ success: false, error: { code: 'STAFF_ACCESS_REQUIRED', message: 'Active back-office account required' } });
    req.staff = profile; next();
  } catch (error) { next(error); }
};

export const requirePermission = (permission) => async (req, res, next) => {
  try {
    if (!req.staff) req.staff = await backofficeStaffService.profileFromToken(req.user);
    if (!req.staff || !backofficeStaffService.hasPermission(req.staff, permission)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: `Missing permission: ${permission}` } });
    req.permissionScope = backofficeStaffService.scopeFor(req.staff, permission); next();
  } catch (error) { next(error); }
};

export const applyScope = (query, profile, scope, { ownerColumn = 'assigned_agent_id', teamColumn = 'team_id' } = {}) => {
  if (!query || scope === 'ALL' || profile?.legacyOwner) return query;
  if (scope === 'TEAM') return profile?.team?.id ? query.eq(teamColumn, profile.team.id) : query.eq(teamColumn, '__no_team__');
  if (scope === 'OWN') return profile?.id ? query.eq(ownerColumn, profile.id) : query.eq(ownerColumn, '__no_owner__');
  return query.eq(ownerColumn, '__forbidden__');
};

export default { loadBackOfficeProfile, requirePermission, applyScope };
