/**
 * Regression: resident video communication — library, targeted sends, sequences (mig 143).
 *
 * The rules this pins down are the ones that are easy to get subtly wrong and expensive to
 * discover in production:
 *   • an empty audience means NOBODY (never "everyone by accident")
 *   • a late joiner gets day 1 ONLY — never a backlog of thirty videos in one morning
 *   • the per-day cap holds across ALL sequences a resident is enrolled in
 *   • re-running the daily job is a no-op (unique (sequence_id, step_id, user_id))
 *   • a calendar step fires on its month-day and not on any other day
 *   • push copy is translated per recipient language
 *   • a mandatory notice re-nags once, and only while genuinely unwatched
 *   • "sent" and "watched" stay separate — that gap IS the compliance evidence
 *
 * Real DB, self-cleaning. Push/notification delivery is stubbed so the suite never
 * depends on Expo; the translation service is stubbed so it never depends on an API key.
 */
require('dotenv').config();

// Stub delivery + translation BEFORE the services are required (they destructure at load).
const notified = [];
jest.mock('../../src/services/inAppNotification.service', () => ({
  notify: jest.fn(async (p) => { notified.push(p); return { id: 'stub' }; }),
  notifyMany: jest.fn(async () => []),
}));
jest.mock('../../src/services/translation.service', () => ({
  // Deterministic, inspectable "translation": prefix with the target language.
  translateText: jest.fn(async (text, src, tgt) => (src === tgt ? text : `[${tgt}] ${text}`)),
  getUserLanguage: jest.fn(async () => 'hu'),
}));

const { query } = require('../../src/database/connection');
const audience = require('../../src/services/videoAudience.service');
const announce = require('../../src/services/videoAnnounce.service');
const sequences = require('../../src/services/videoSequence.service');

const TAG = 'ZVideoComm';
const ids = { users: {}, videos: {}, seq: {} };

const daysAgo = (n) => {
  const d = new Date(); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const today = () => daysAgo(0);

async function cleanup() {
  await query(`DELETE FROM video_sequence_sends WHERE sequence_id IN (SELECT id FROM video_sequences WHERE name LIKE $1)`, [TAG + '%']);
  await query(`DELETE FROM video_announcement_recipients WHERE announcement_id IN (SELECT id FROM video_announcements WHERE video_id IN (SELECT id FROM videos WHERE title LIKE $1))`, [TAG + '%']);
  await query(`DELETE FROM video_announcements WHERE video_id IN (SELECT id FROM videos WHERE title LIKE $1)`, [TAG + '%']);
  await query(`DELETE FROM video_sequence_steps WHERE sequence_id IN (SELECT id FROM video_sequences WHERE name LIKE $1)`, [TAG + '%']);
  await query(`DELETE FROM video_sequences WHERE name LIKE $1`, [TAG + '%']);
  await query(`DELETE FROM video_views WHERE video_id IN (SELECT id FROM videos WHERE title LIKE $1)`, [TAG + '%']);
  await query(`DELETE FROM video_versions WHERE video_id IN (SELECT id FROM videos WHERE title LIKE $1)`, [TAG + '%']);
  await query(`DELETE FROM videos WHERE title LIKE $1`, [TAG + '%']);
  await query(`DELETE FROM employees WHERE last_name = $1`, [TAG]);
  await query(`DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, ['%@zvideocomm.local']);
  await query(`DELETE FROM users WHERE email LIKE $1`, ['%@zvideocomm.local']);
  await query(`DELETE FROM accommodations WHERE name LIKE $1`, [TAG + '%']);
}

beforeAll(async () => {
  await cleanup();
  const status = (await query(`SELECT id FROM employee_status_types WHERE slug='active'`)).rows[0]?.id || null;

  ids.accA = (await query(`INSERT INTO accommodations (name,capacity,status,is_active) VALUES ($1,50,'occupied',true) RETURNING id`, [`${TAG}-A`])).rows[0].id;
  ids.accB = (await query(`INSERT INTO accommodations (name,capacity,status,is_active) VALUES ($1,50,'occupied',true) RETURNING id`, [`${TAG}-B`])).rows[0].id;

  // Residents. `arrivedDaysAgo` drives the drip day-index; `lang` drives translation.
  const mkResident = async (key, { acc, lang, arrivedDaysAgo }) => {
    const u = (await query(
      `INSERT INTO users (email,password_hash,first_name,last_name,is_active,preferred_language)
       VALUES ($1,'x',$2,$3,true,$4) RETURNING id`,
      [`${key}@zvideocomm.local`, key, TAG, lang])).rows[0].id;
    const e = (await query(
      `INSERT INTO employees (first_name,last_name,status_id,accommodation_id,user_id,arrival_date)
       VALUES ($1,$2,$3,$4,$5,$6::date) RETURNING id`,
      [key, TAG, status, acc, u, daysAgo(arrivedDaysAgo)])).rows[0].id;
    ids.users[key] = { user_id: u, employee_id: e, lang };
    return u;
  };
  await mkResident('fresh', { acc: ids.accA, lang: 'hu', arrivedDaysAgo: 0 });   // moved in TODAY → day 1
  await mkResident('day3',  { acc: ids.accA, lang: 'uk', arrivedDaysAgo: 2 });   // day 3
  await mkResident('late',  { acc: ids.accA, lang: 'en', arrivedDaysAgo: 40 });  // long-standing → late join
  await mkResident('other', { acc: ids.accB, lang: 'de', arrivedDaysAgo: 5 });   // different accommodation

  const mkVideo = async (key, category) => {
    const v = (await query(
      `INSERT INTO videos (title,description,url,category,scope,base_language,is_active)
       VALUES ($1,$2,'https://example.test/v.mp4',$3,'global','hu',true) RETURNING id`,
      [`${TAG} ${key}`, `${key} leírás`, category])).rows[0].id;
    ids.videos[key] = v;
    return v;
  };
  await mkVideo('intro', 'lakhatas');
  await mkVideo('rules', 'lakhatas');
  await mkVideo('laundry', 'lakhatas');
  await mkVideo('xmas', 'unnepek');
  await mkVideo('adhoc', 'ugyintezes');
  await mkVideo('mandatory', 'ugyintezes');

  await query(`UPDATE video_delivery_config SET max_videos_per_day = 1, renag_after_days = 3, enabled = TRUE, renag_enabled = TRUE`);
}, 60000);

afterAll(cleanup);

/* ───────────────────────── audience resolution ───────────────────────── */

describe('audience resolution — "whoever it concerns", never blanket by accident', () => {
  test('an EMPTY audience resolves to nobody', async () => {
    const r = await audience.resolve({});
    expect(r.count).toBe(0);
    expect(r.warnings.join(' ')).toMatch(/Nincs célközönség/);
  });

  test('by accommodation returns only that site', async () => {
    const r = await audience.resolve({ accommodation_ids: [ids.accA] });
    const got = r.recipients.map((x) => x.user_id).sort();
    expect(got).toEqual([ids.users.fresh.user_id, ids.users.day3.user_id, ids.users.late.user_id].sort());
    expect(got).not.toContain(ids.users.other.user_id);
  });

  test('by language picks the right residents and carries their language through', async () => {
    const r = await audience.resolve({ languages: ['uk', 'de'] });
    const mine = r.recipients.filter((x) => [ids.users.day3.user_id, ids.users.other.user_id].includes(x.user_id));
    expect(mine).toHaveLength(2);
    expect(mine.find((x) => x.user_id === ids.users.day3.user_id).language).toBe('uk');
  });

  test('a resident with no user account is never a recipient', async () => {
    const status = (await query(`SELECT id FROM employee_status_types WHERE slug='active'`)).rows[0]?.id || null;
    await query(
      `INSERT INTO employees (first_name,last_name,status_id,accommodation_id,arrival_date)
       VALUES ('nologin',$1,$2,$3,CURRENT_DATE)`, [TAG, status, ids.accA]);
    const r = await audience.resolve({ accommodation_ids: [ids.accA] });
    expect(r.count).toBe(3);   // still the three with logins
  });
});

/* ───────────────────────── ad-hoc send + translation ─────────────────── */

describe('Mode B — ad-hoc send, translated per recipient language', () => {
  test('every recipient gets copy in THEIR language', async () => {
    notified.length = 0;
    const res = await announce.send(ids.videos.adhoc, { accommodation_ids: [ids.accA] }, { createdBy: null });
    expect(res.recipient_count).toBe(3);
    expect(res.languages.sort()).toEqual(['en', 'hu', 'uk']);

    const byUser = Object.fromEntries(notified.map((n) => [n.userId, n]));
    // hu is the video's base language → untouched; the others go through translation.
    expect(byUser[ids.users.fresh.user_id].title).toBe(`${TAG} adhoc`);
    expect(byUser[ids.users.day3.user_id].title).toBe(`[uk] ${TAG} adhoc`);
    expect(byUser[ids.users.late.user_id].title).toBe(`[en] ${TAG} adhoc`);
  });

  test('the push carries the deep-link payload and the translated copy', () => {
    const p = notified.find((n) => n.userId === ids.users.day3.user_id).push;
    expect(p.type).toBe('video_announcement');
    expect(p.data).toMatchObject({ type: 'video_announcement', video_id: ids.videos.adhoc });
    expect(p.vars.title).toBe(`[uk] ${TAG} adhoc`);
  });

  test('delivery is logged per recipient with the language used', async () => {
    const rows = (await query(
      `SELECT r.language, r.push_ok FROM video_announcement_recipients r
         JOIN video_announcements a ON a.id = r.announcement_id
        WHERE a.video_id = $1`, [ids.videos.adhoc])).rows;
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.push_ok === true)).toBe(true);
    expect(rows.map((r) => r.language).sort()).toEqual(['en', 'hu', 'uk']);
  });

  test('an audience matching nobody sends nothing rather than everything', async () => {
    const res = await announce.send(ids.videos.adhoc, { accommodation_ids: ['00000000-0000-0000-0000-000000000001'] }, {});
    expect(res.skipped).toBe('no_recipients');
    expect(res.recipient_count).toBe(0);
  });
});

/* ───────────────────────── A1: the drip ──────────────────────────────── */

describe('Mode A1 — move-in drip, day index from each resident\'s own arrival', () => {
  beforeAll(async () => {
    ids.seq.housing = (await query(
      `INSERT INTO video_sequences (name, anchor_type, audience, is_active)
       VALUES ($1,'move_in',$2,true) RETURNING id`,
      [`${TAG} Lakhatási alapok`, JSON.stringify({ accommodation_ids: [ids.accA] })])).rows[0].id;
    // Arbitrary day indexes — dense first, sparse after.
    for (const [day, key] of [[1, 'intro'], [2, 'rules'], [7, 'laundry']]) {
      await query(
        `INSERT INTO video_sequence_steps (sequence_id, video_id, day_offset) VALUES ($1,$2,$3)`,
        [ids.seq.housing, ids.videos[key], day]);
    }
  });

  test('LATE JOIN: someone housed 40 days gets day 1 ONLY — no backlog', async () => {
    const due = await sequences.collectDue(today());
    const forLate = due.filter((d) => d.recipient.user_id === ids.users.late.user_id);
    expect(forLate).toHaveLength(1);
    expect(forLate[0].step.day_offset).toBe(1);
    expect(forLate[0].late_join).toBe(true);
    // Explicitly NOT days 2 and 7, even though their day-index is 41.
    expect(forLate.map((d) => d.step.day_offset)).not.toContain(2);
    expect(forLate.map((d) => d.step.day_offset)).not.toContain(7);
  });

  test('someone who moved in today is on day 1 as well', async () => {
    const due = await sequences.collectDue(today());
    const forFresh = due.filter((d) => d.recipient.user_id === ids.users.fresh.user_id);
    expect(forFresh).toHaveLength(1);
    expect(forFresh[0].day_index).toBe(1);
  });

  test('the run sends, and re-running the same day is a complete no-op', async () => {
    const first = await sequences.runDaily({});
    expect(first.sent).toBeGreaterThan(0);
    const rows1 = (await query(`SELECT COUNT(*)::int c FROM video_sequence_sends WHERE sequence_id=$1`, [ids.seq.housing])).rows[0].c;

    const second = await sequences.runDaily({});
    const rows2 = (await query(`SELECT COUNT(*)::int c FROM video_sequence_sends WHERE sequence_id=$1`, [ids.seq.housing])).rows[0].c;
    expect(rows2).toBe(rows1);          // unique (sequence_id, step_id, user_id) held
    expect(second.sent).toBe(0);
  });

  test('after day 1, the NEXT step becomes due by the resident\'s own index', async () => {
    // day3 arrived 2 days ago → index 3, so steps 1 and 2 are both in the past. Having had
    // step 1, step 2 is now due (step 7 is not).
    const due = await sequences.collectDue(today());
    const offsets = due.filter((d) => d.recipient.user_id === ids.users.day3.user_id).map((d) => d.step.day_offset);
    expect(offsets).toContain(2);
    expect(offsets).not.toContain(7);
  });

  test('a resident outside the audience is never enrolled', async () => {
    const rows = (await query(
      `SELECT COUNT(*)::int c FROM video_sequence_sends WHERE sequence_id=$1 AND user_id=$2`,
      [ids.seq.housing, ids.users.other.user_id])).rows[0].c;
    expect(rows).toBe(0);
  });
});

/* ───────────────────────── multi-sequence + per-day cap ──────────────── */

describe('several sequences at once — the per-day cap protects the resident', () => {
  beforeAll(async () => {
    ids.seq.work = (await query(
      `INSERT INTO video_sequences (name, anchor_type, audience, is_active)
       VALUES ($1,'move_in',$2,true) RETURNING id`,
      [`${TAG} Munkahelyi ügyintézés`, JSON.stringify({ accommodation_ids: [ids.accA] })])).rows[0].id;
    await query(`INSERT INTO video_sequence_steps (sequence_id, video_id, day_offset) VALUES ($1,$2,1)`,
      [ids.seq.work, ids.videos.mandatory]);
  });

  test('cap 1/day: a resident enrolled in two sequences receives ONE today, the rest defers', async () => {
    await query(`UPDATE video_delivery_config SET max_videos_per_day = 1`);
    await query(`DELETE FROM video_sequence_sends WHERE sequence_id = ANY($1::uuid[])`, [[ids.seq.housing, ids.seq.work]]);

    const run = await sequences.runDaily({});
    const perUser = (await query(
      `SELECT user_id, COUNT(*)::int c FROM video_sequence_sends
        WHERE sent_on = CURRENT_DATE GROUP BY user_id`)).rows;
    expect(perUser.every((r) => r.c <= 1)).toBe(true);
    expect(run.deferred).toBeGreaterThan(0);          // nothing dropped — just tomorrow's problem
  });

  test('raising the cap lets the deferred step through on the next run', async () => {
    await query(`UPDATE video_delivery_config SET max_videos_per_day = 5`);
    const before = (await query(`SELECT COUNT(*)::int c FROM video_sequence_sends WHERE sent_on = CURRENT_DATE`)).rows[0].c;
    await sequences.runDaily({});
    const after = (await query(`SELECT COUNT(*)::int c FROM video_sequence_sends WHERE sent_on = CURRENT_DATE`)).rows[0].c;
    expect(after).toBeGreaterThan(before);
  });
});

/* ───────────────────────── A2: calendar ──────────────────────────────── */

describe('Mode A2 — calendar series fires on its month-day only', () => {
  beforeAll(async () => {
    ids.seq.xmas = (await query(
      `INSERT INTO video_sequences (name, anchor_type, audience, is_active)
       VALUES ($1,'calendar',$2,true) RETURNING id`,
      [`${TAG} Ünnepek`, JSON.stringify({ all: true })])).rows[0].id;
    await query(`INSERT INTO video_sequence_steps (sequence_id, video_id, month_day) VALUES ($1,$2,'12-20')`,
      [ids.seq.xmas, ids.videos.xmas]);
  });

  test('does NOT fire on an unrelated date', async () => {
    const due = await sequences.collectDue('2026-06-15');
    expect(due.filter((d) => d.sequence.id === ids.seq.xmas)).toHaveLength(0);
  });

  test('fires for the whole audience on 12-20, in any year', async () => {
    const due2026 = await sequences.collectDue('2026-12-20');
    const due2027 = await sequences.collectDue('2027-12-20');
    expect(due2026.filter((d) => d.sequence.id === ids.seq.xmas).length).toBeGreaterThanOrEqual(4);
    expect(due2027.filter((d) => d.sequence.id === ids.seq.xmas).length).toBeGreaterThanOrEqual(4);
  });

  test('once sent it does not repeat on a re-run of the same day', async () => {
    await query(`UPDATE video_delivery_config SET max_videos_per_day = 20`);
    await sequences.runDaily({ today: '2026-12-20' });
    const c1 = (await query(`SELECT COUNT(*)::int c FROM video_sequence_sends WHERE sequence_id=$1`, [ids.seq.xmas])).rows[0].c;
    expect(c1).toBeGreaterThan(0);
    await sequences.runDaily({ today: '2026-12-20' });
    const c2 = (await query(`SELECT COUNT(*)::int c FROM video_sequence_sends WHERE sequence_id=$1`, [ids.seq.xmas])).rows[0].c;
    expect(c2).toBe(c1);
  });
});

/* ───────────────────────── mandatory re-nag + compliance ─────────────── */

describe('mandatory notices — watch evidence and one re-nag', () => {
  let annId;

  beforeAll(async () => {
    const res = await announce.send(ids.videos.mandatory, { accommodation_ids: [ids.accA] }, { isMandatory: true });
    annId = res.announcement_id;
    // One of the three watches it; the other two do not.
    await query(
      `INSERT INTO video_views (user_id, video_id, completed, completed_at, progress_pct, watch_count)
       VALUES ($1,$2,TRUE,NOW(),100,1)`, [ids.users.fresh.user_id, ids.videos.mandatory]);
  });

  test('"sent" and "watched" are tracked separately — that gap is the evidence', async () => {
    const sent = (await query(
      `SELECT COUNT(*)::int c FROM video_announcement_recipients WHERE announcement_id=$1`, [annId])).rows[0].c;
    const watched = (await query(
      `SELECT COUNT(*)::int c FROM video_announcement_recipients r
         JOIN video_views vv ON vv.user_id = r.user_id AND vv.video_id = $2 AND vv.completed
        WHERE r.announcement_id = $1`, [annId, ids.videos.mandatory])).rows[0].c;
    expect(sent).toBe(3);
    expect(watched).toBe(1);
  });

  test('no re-nag before the window has elapsed', async () => {
    const r = await announce.runRenags({});
    expect(r.sent).toBe(0);
  });

  test('after 3 days the unwatched are re-nagged — and the watcher is not', async () => {
    await query(`UPDATE video_announcements SET sent_at = NOW() - INTERVAL '4 days' WHERE id=$1`, [annId]);
    notified.length = 0;
    const r = await announce.runRenags({});
    expect(r.sent).toBe(2);                                   // the two who never watched
    const targets = notified.map((n) => n.userId);
    expect(targets).not.toContain(ids.users.fresh.user_id);   // the watcher is left alone
    expect(notified[0].data.renag).toBe(true);
  });

  test('the re-nag happens ONCE, not once per run', async () => {
    const r = await announce.runRenags({});
    expect(r.sent).toBe(0);
    const stamped = (await query(
      `SELECT COUNT(*)::int c FROM video_announcement_recipients WHERE announcement_id=$1 AND renag_sent_at IS NOT NULL`,
      [annId])).rows[0].c;
    expect(stamped).toBe(2);
  });

  test('the re-nag is in the recipient\'s own language', () => {
    const uk = notified.find((n) => n.userId === ids.users.day3.user_id);
    expect(uk.title).toMatch(/^Нагадування: \[uk\]/);
  });
});
