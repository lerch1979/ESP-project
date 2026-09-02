/**
 * Module scope — a fail-closed allow-list for role families that may only ever reach
 * ONE part of the API.
 *
 * WHY AN ALLOW-LIST, AND WHY HERE
 * -------------------------------
 * The first consumer is the external sales agent (`kulso_ertekesito`): a person outside
 * the company with a login, who must see the sales module and nothing else — no
 * accommodations, residents, billing, tickets, consolidation or wellbeing.
 *
 * There are 77 route files. A deny-list across them is unmaintainable and rots the first
 * time someone adds route file #78 — and the cost of missing one is an outsider reading
 * operational data. So the rule is inverted: an externally-scoped role may reach ONLY the
 * prefixes named below, and everything else is 403 by default. A new route is denied to
 * external roles until someone deliberately adds it here.
 *
 * It lives inside `authenticateToken` (not as an app-level `router.use`) for two reasons:
 *   1. it needs `req.user.roles`, which only exists after the token is verified;
 *   2. `residentSelf.routes.js` documents what happens when a path-less `router.use` is
 *      mounted at the bare API prefix — it ran for EVERY `/api/v1/*` request and 401-gated
 *      the public chatbot endpoints. Running after authentication avoids that entirely.
 *
 * NOTE ON SCOPE: this decides which MODULE a caller may reach. It says nothing about WHICH
 * ROWS they see inside it — that is the sales repository's `owner_user_id` predicate, and
 * the two are deliberately independent layers.
 */

// Roles that are confined to a single module. A user is confined when EVERY role they hold
// appears here — holding an ordinary staff role alongside lifts the confinement, so an
// internal sales manager with `admin` is unaffected.
const CONFINED_ROLES = {
  // The sales role does not exist yet (it ships with mig 147, Phase 4). Listing it now
  // means the boundary is in place and tested BEFORE the first external account exists,
  // rather than being retrofitted around one.
  kulso_ertekesito: 'sales',
};

// Path prefixes each confined module may reach, matched against the path AFTER the API
// prefix (e.g. '/sales/leads'). Longest-prefix matching is not needed — a simple
// startsWith is enough and is easier to audit.
const MODULE_ALLOW = {
  sales: [
    '/sales',            // the module itself (leads, opportunities, quotes, contacts…)
    '/auth/me',          // who am I
    '/auth/logout',
    '/auth/change-password',
    '/preferences',      // own UI preferences
    '/notification-center', // own notifications (self-scoped in its controller)
    '/translation',      // UI string translation
  ],
};

/**
 * Returns null when the caller is unconfined or the path is allowed; otherwise a
 * { status, body } to send.
 */
function checkModuleScope(req) {
  const roles = req.user?.roles || [];
  if (roles.length === 0) return null;

  // Confined only if EVERY held role is a confined one.
  const modules = new Set();
  for (const r of roles) {
    if (!CONFINED_ROLES[r]) return null; // holds at least one unconfined role
    modules.add(CONFINED_ROLES[r]);
  }
  // A user confined to two different modules is a misconfiguration; deny rather than
  // guess which one wins.
  if (modules.size !== 1) {
    return {
      status: 403,
      body: { success: false, message: 'Hozzáférés megtagadva (ellentmondásos szerepkör)' },
    };
  }

  const moduleName = [...modules][0];
  const allowed = MODULE_ALLOW[moduleName] || [];

  // req.path here is relative to the mount point of authenticateToken's router, which
  // varies, so use the full originalUrl minus the API prefix and query string.
  const url = (req.originalUrl || req.url || '').split('?')[0];
  const afterPrefix = url.replace(/^\/api\/v\d+/, '');

  const ok = allowed.some(
    (p) => afterPrefix === p || afterPrefix.startsWith(p + '/'),
  );
  if (ok) return null;

  return {
    status: 403,
    body: { success: false, message: 'Ehhez a modulhoz nincs hozzáférésed' },
  };
}

module.exports = { checkModuleScope, CONFINED_ROLES, MODULE_ALLOW };
