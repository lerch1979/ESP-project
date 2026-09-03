/**
 * Lint-style guard: nothing may build its own mail transport.
 *
 * The 2026-09-03 incident was not one unguarded function — it was SIX modules that had
 * each grown their own `nodemailer.createTransport(...)`. A fix applied to one of them
 * would have left five open doors, and the seventh copy would reopen it silently a month
 * later. So the invariant is structural and checked here rather than remembered:
 *
 *   src/utils/mailGuard.js is the ONLY file allowed to touch nodemailer.
 *
 * If this test fails, do not add an exception — route the new sender through
 * `createGuardedTransport(options, 'your-module')` instead.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SEARCH_DIRS = ['src', 'scripts'];
const ALLOWED = new Set([
  path.join('src', 'utils', 'mailGuard.js'),
]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      walk(p, out);
    } else if (e.name.endsWith('.js')) {
      out.push(p);
    }
  }
  return out;
}

describe('outbound mail has exactly one door', () => {
  const files = SEARCH_DIRS
    .map((d) => path.join(ROOT, d))
    .filter((d) => fs.existsSync(d))
    .flatMap((d) => walk(d));

  it('finds source files to check (guards against a broken walk silently passing)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('no module outside mailGuard.js requires nodemailer', () => {
    const offenders = files.filter((f) => {
      const rel = path.relative(ROOT, f);
      if (ALLOWED.has(rel)) return false;
      // .BACKUP / .bak copies are dead code, not shipped, but flag real .js only.
      const src = fs.readFileSync(f, 'utf8');
      return /require\(\s*['"]nodemailer['"]\s*\)/.test(src);
    }).map((f) => path.relative(ROOT, f));

    expect(offenders).toEqual([]);
  });

  it('no module outside mailGuard.js calls createTransport', () => {
    const offenders = files.filter((f) => {
      const rel = path.relative(ROOT, f);
      if (ALLOWED.has(rel)) return false;
      return /\.createTransport\s*\(/.test(fs.readFileSync(f, 'utf8'));
    }).map((f) => path.relative(ROOT, f));

    expect(offenders).toEqual([]);
  });

  // Positive control: the six known senders must actually be wired to the guard, so a
  // future refactor cannot satisfy the checks above by deleting the sending code and
  // quietly reintroducing it elsewhere.
  it('every known sender uses createGuardedTransport', () => {
    const senders = [
      'src/utils/emailService.js',
      'src/services/email.service.js',
      'src/services/compensation.service.js',
      'src/services/multilingualEmail.service.js',
      'src/services/agentEmail.service.js',
      'src/services/inspectionNotification.service.js',
    ];
    for (const rel of senders) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(`${rel}: ${/createGuardedTransport\s*\(/.test(src)}`).toBe(`${rel}: true`);
    }
  });
});
