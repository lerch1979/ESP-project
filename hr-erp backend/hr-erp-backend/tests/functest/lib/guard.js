/**
 * SANDBOX GUARD — the single hard stop between this suite and any real database.
 *
 * The functest harness seeds, mutates, bills, anonymizes and resets. Every one of
 * those is destructive. Nothing in this suite may run unless BOTH the configured
 * target AND the live connection prove they are the sandbox.
 *
 * Two independent checks, because either alone can lie:
 *   1. env-level  — DB_NAME/DB_HOST/NODE_ENV before a socket is opened
 *   2. live-level — SELECT current_database() on the pool the services actually use
 *      (catches a service that hardcodes a DSN, or a stale pool from another module)
 */
const SANDBOX_RE = /sandbox/i;
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', ''];

// Names that must never be touched even if someone renames them to contain "sandbox".
const FORBIDDEN = ['hr_erp_db', 'hr_erp_prod', 'hr_erp_production'];

function fail(msg) {
  const err = new Error(
    `\n\n✋ FUNCTEST SANDBOX GUARD TRIPPED\n   ${msg}\n\n` +
    `   This suite mutates and erases data. It runs ONLY against a database whose\n` +
    `   name contains "sandbox", on localhost, with NODE_ENV != production.\n` +
    `   Correct invocation:  npm run functest\n`
  );
  err.guard = true;
  throw err;
}

/** Env-level check — call before opening any connection. */
function assertSandboxEnv() {
  const name = process.env.DB_NAME || '';
  const host = process.env.DB_HOST || '';
  const env = process.env.NODE_ENV || '';

  if (env === 'production') fail(`NODE_ENV=production`);
  if (!name) fail(`DB_NAME is unset — refusing to fall back to the default (hr_erp_db)`);
  if (FORBIDDEN.includes(name.toLowerCase())) fail(`DB_NAME="${name}" is a protected database`);
  if (!SANDBOX_RE.test(name)) fail(`DB_NAME="${name}" does not contain "sandbox"`);
  if (!LOCAL_HOSTS.includes(host.toLowerCase())) fail(`DB_HOST="${host}" is not local`);
  return { name, host: host || 'localhost' };
}

/**
 * Live-level check — asks the connection the services themselves use.
 * @param {(sql: string) => Promise<{rows: any[]}>} query
 */
async function assertSandboxLive(query) {
  // host() strips the /prefixlen that inet_server_addr() carries (e.g. "::1/128").
  const r = await query('SELECT current_database() AS db, host(inet_server_addr()) AS addr');
  const db = r.rows[0].db;
  if (FORBIDDEN.includes(String(db).toLowerCase())) fail(`connected to protected database "${db}"`);
  if (!SANDBOX_RE.test(db)) fail(`connected to "${db}", which is not a sandbox`);
  const addr = r.rows[0].addr;
  // NULL addr = unix socket / loopback. A routable address means a remote server.
  if (addr && !LOCAL_HOSTS.includes(addr)) fail(`connected to a REMOTE server (${addr})`);
  return db;
}

module.exports = { assertSandboxEnv, assertSandboxLive, SANDBOX_RE };
