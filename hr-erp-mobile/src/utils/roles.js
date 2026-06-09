// Role helpers for the mobile app.
//
// Defensive against the two user shapes the backend returns:
//   - POST /auth/login → user.roleSlugs = [slugs], user.roles = [display names]
//   - GET  /auth/me    → user.roles = [slugs] (from the JWT), no roleSlugs
// So we check BOTH arrays for the slug.

export const ROLE_RESIDENT = 'accommodated_employee';

export function userRoleSlugs(user) {
  return [...(user?.roleSlugs || []), ...(user?.roles || [])];
}

export function isResident(user) {
  return userRoleSlugs(user).includes(ROLE_RESIDENT);
}
