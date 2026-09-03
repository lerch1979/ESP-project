/**
 * The outbound mail guard — the control that was missing on 2026-09-03, when 44 real
 * messages left a developer laptop over 60 days because FUNCTEST's AUTO-01 calls the
 * real executeReport() and sendEmail() had no environment check at all.
 *
 * Nothing reached a third party only because the fixture recipient (admin@sandbox.local)
 * does not resolve. These tests exist so the protection is a control and not a DNS
 * accident.
 */
const path = require('path');

const GUARD = path.join(__dirname, '..', 'src', 'utils', 'mailGuard');

/** Load the guard with a specific environment, since it reads process.env per-call. */
function withEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; }
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  try { return fn(); } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
}

// A clean production-shaped environment: no harness markers, real DB, real recipient.
const PROD_ENV = {
  NODE_ENV: 'production', DB_NAME: 'hr_erp',
  JEST_WORKER_ID: undefined, FUNCTEST: undefined, FUNCTEST_RUN_ID: undefined,
  MAIL_OUTBOUND_DISABLED: undefined,
};

const { blockReason, guardTransport } = require(GUARD);

describe('mailGuard.blockReason', () => {
  it('ALLOWS an ordinary production send', () => {
    withEnv(PROD_ENV, () => {
      expect(blockReason({ to: 'konyveles@housingsolutions.hu', subject: 'Havi elszámolás' }))
        .toBeNull();
    });
  });

  it('blocks when NODE_ENV=test', () => {
    withEnv({ ...PROD_ENV, NODE_ENV: 'test' }, () => {
      expect(blockReason({ to: 'real@housingsolutions.hu', subject: 'Riport' }))
        .toMatch(/test harness/i);
    });
  });

  it('blocks under a jest worker even when NODE_ENV says production', () => {
    withEnv({ ...PROD_ENV, JEST_WORKER_ID: '3' }, () => {
      expect(blockReason({ to: 'real@housingsolutions.hu', subject: 'Riport' })).toBeTruthy();
    });
  });

  it('blocks when the database is the sandbox', () => {
    withEnv({ ...PROD_ENV, DB_NAME: 'hr_erp_sandbox' }, () => {
      expect(blockReason({ to: 'real@housingsolutions.hu', subject: 'Riport' }))
        .toMatch(/sandbox database/i);
    });
  });

  // The incident shape: a fixture pointed at dev or production. This must be
  // distinguishable in the logs from a routine sandbox block.
  it('blocks LOUDLY when a harness runs against a non-sandbox database', () => {
    withEnv({ ...PROD_ENV, NODE_ENV: 'test', DB_NAME: 'hr_erp' }, () => {
      expect(blockReason({ to: 'real@housingsolutions.hu', subject: 'Riport' }))
        .toMatch(/NON-SANDBOX/);
    });
  });

  it('blocks reserved recipient domains even with no harness marker at all', () => {
    withEnv(PROD_ENV, () => {
      for (const to of ['admin@sandbox.local', 'x@functest.local', 'a@foo.test',
                        'b@bar.invalid', 'c@example.com']) {
        expect(blockReason({ to, subject: 'Riport' })).toMatch(/reserved\/test recipient/i);
      }
    });
  });

  it('blocks the exact message from the incident', () => {
    withEnv(PROD_ENV, () => {
      expect(blockReason({
        to: 'admin@sandbox.local',
        subject: 'FT Havi kihasználtság - Kihasználtság riport (2026. 09. 03.)',
      })).toBeTruthy();
    });
  });

  it('blocks on the fixture tag alone, even to a deliverable address', () => {
    withEnv(PROD_ENV, () => {
      expect(blockReason({ to: 'owner@housingsolutions.hu', subject: 'FT Havi kihasználtság' }))
        .toMatch(/fixture tag/i);
      expect(blockReason({ to: 'owner@housingsolutions.hu', subject: 'SBX Havi költséghely' }))
        .toMatch(/fixture tag/i);
    });
  });

  it('does NOT block an ordinary subject that merely starts with those letters', () => {
    withEnv(PROD_ENV, () => {
      expect(blockReason({ to: 'a@housingsolutions.hu', subject: 'FTP hozzáférés' })).toBeNull();
      expect(blockReason({ to: 'a@housingsolutions.hu', subject: 'Sbxyz' })).toBeNull();
    });
  });

  it('honours the explicit kill switch', () => {
    withEnv({ ...PROD_ENV, MAIL_OUTBOUND_DISABLED: 'true' }, () => {
      expect(blockReason({ to: 'a@housingsolutions.hu', subject: 'Riport' }))
        .toMatch(/kill switch/i);
    });
  });

  it('checks EVERY recipient, not just the first', () => {
    withEnv(PROD_ENV, () => {
      expect(blockReason({ to: ['ok@housingsolutions.hu', 'admin@sandbox.local'], subject: 'x' }))
        .toMatch(/reserved/i);
      expect(blockReason({ to: 'ok@housingsolutions.hu, admin@sandbox.local', subject: 'x' }))
        .toMatch(/reserved/i);
    });
  });
});

describe('mailGuard.guardTransport', () => {
  const mkTransport = () => {
    const sent = [];
    return {
      sent,
      sendMail: async (m) => { sent.push(m); return { messageId: '<real@send>' }; },
    };
  };

  it('does not call the real transport when blocked, and never throws', async () => {
    await withEnv({ ...PROD_ENV, NODE_ENV: 'test' }, async () => {
      const t = mkTransport();
      guardTransport(t, 'unit');
      const r = await t.sendMail({ to: 'admin@sandbox.local', subject: 'FT Havi kihasználtság' });
      expect(t.sent).toHaveLength(0);          // nothing left the process
      expect(r.blocked).toBe(true);            // and the caller sees a shortfall...
      expect(r.messageId).toBeUndefined();     // ...not a fake success
      expect(r.response).toMatch(/BLOCKED by mailGuard/);
    });
  });

  it('passes a legitimate send straight through', async () => {
    await withEnv(PROD_ENV, async () => {
      const t = mkTransport();
      guardTransport(t, 'unit');
      const r = await t.sendMail({ to: 'konyveles@housingsolutions.hu', subject: 'Havi elszámolás' });
      expect(t.sent).toHaveLength(1);
      expect(r.messageId).toBe('<real@send>');
      expect(r.blocked).toBeUndefined();
    });
  });

  it('is idempotent — wrapping twice does not double-guard or double-send', async () => {
    await withEnv(PROD_ENV, async () => {
      const t = mkTransport();
      guardTransport(guardTransport(t, 'unit'), 'unit');
      await t.sendMail({ to: 'a@housingsolutions.hu', subject: 'ok' });
      expect(t.sent).toHaveLength(1);
    });
  });
});

/**
 * The defect this suite exists to prevent SECOND: a blocked send that reports success.
 *
 * The guard resolves rather than throws, so the first version of this change stopped the
 * message but left `sendEmail` returning { success: true, messageId: undefined }. The
 * report scheduler counts successes, so it would have recorded delivered_count = 1 for a
 * message that never left the process — a silent success, which is precisely the bug the
 * 2026-07-05 delivery-accounting fix removed. Blocking must be VISIBLE to the caller.
 */
describe('a blocked send is never reported as delivered', () => {
  it('emailService.sendEmail returns success:false with blocked:true', async () => {
    await withEnv({ NODE_ENV: 'test', DB_NAME: 'hr_erp_sandbox' }, async () => {
      jest.resetModules();
      const { sendEmail } = require(path.join(__dirname, '..', 'src', 'utils', 'emailService'));
      const r = await sendEmail({
        to: 'admin@sandbox.local',
        subject: 'FT Havi kihasználtság - Kihasználtság riport',
        html: '<p>x</p>',
      });
      expect(r.success).toBe(false);
      expect(r.blocked).toBe(true);
      expect(r.messageId).toBeUndefined();
      expect(r.error).toMatch(/BLOCKED by mailGuard/);
    });
  });

  it('the guard marks blocked results in a way nodemailer never would', () => {
    const { wasBlocked } = require(GUARD);
    expect(wasBlocked({ messageId: '<x@y>', accepted: ['a@b.hu'] })).toBe(false);
    expect(wasBlocked({ blocked: true })).toBe(true);
    expect(wasBlocked(undefined)).toBe(false);
  });
});
