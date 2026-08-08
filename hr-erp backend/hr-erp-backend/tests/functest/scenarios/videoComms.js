/**
 * VIDEO COMMUNICATION — resident library, targeted sends, automated sequences (mig 143).
 *
 * The jest suite (tests/integration/videoCommunication.test.js) pins the engine semantics
 * with stubbed delivery. This area proves the parts that only show up end-to-end:
 * the REAL resident HTTP surface (Path B self-scoping), the library's language
 * resolution, and that a resident can never reach the staff video endpoints.
 */
const http = require('../lib/http');

module.exports = {
  area: 'VIDEO',
  title: 'resident library (self-scoped) · audience resolution · sequences · watch evidence',

  async setup(ctx) {
    const audience = require('../../../src/services/videoAudience.service');
    const announce = require('../../../src/services/videoAnnounce.service');
    const sequences = require('../../../src/services/videoSequence.service');

    // Pin the delivery config to known values — the jest suite tunes this same singleton,
    // and this suite's expectations must not depend on whatever it left behind.
    await ctx.query(
      `UPDATE video_delivery_config SET enabled=TRUE, max_videos_per_day=1, renag_after_days=3, renag_enabled=TRUE`);

    // A resident who speaks Ukrainian, so language resolution is observable.
    const resUser = ctx.ids.user.accommodated_employee;
    await ctx.query(`UPDATE users SET preferred_language='uk' WHERE id=$1`, [resUser]);
    await ctx.query(`UPDATE employees SET arrival_date = CURRENT_DATE WHERE id=$1`, [ctx.ids.emp.t1]);

    // A global library video with a Ukrainian version, and a targeted one.
    // videos_scope_target_check (mig 08x): a contractor-scoped video MUST carry a
    // contractor_id — the scope column and its target are validated together.
    const mk = async (title, category, scope, contractorId = null) => (await ctx.query(
      `INSERT INTO videos (title,description,url,category,scope,contractor_id,base_language,is_active)
       VALUES ($1,$2,'https://example.test/base.mp4',$3,$4,$5,'hu',true) RETURNING id`,
      [`${ctx.tag} ${title}`, `${title} leírás`, category, scope, contractorId])).rows[0].id;

    const libraryId = await mk('Konyha hasznalata', 'lakhatas', 'global');
    await ctx.query(
      `INSERT INTO video_versions (video_id, language, playback_url, status) VALUES ($1,'uk',$2,'ready')`,
      [libraryId, 'https://example.test/uk.mp4']);
    // Scoped to a tenant the resident is NOT in: invisible until personally sent.
    const targetedId = await mk('Orvos idopont', 'ugyintezes', 'contractor', ctx.ids.client.T2);
    const hiddenId = await mk('Csak masoknak', 'ugyintezes', 'contractor', ctx.ids.client.T2);

    return { audience, announce, sequences, resUser, libraryId, targetedId, hiddenId,
             token: http.tokenFor(resUser), superToken: http.tokenFor(ctx.ids.user.superadmin) };
  },

  cases: [
    {
      id: 'VID-01',
      name: 'a resident is still 403 on the STAFF video endpoints (Path B holds)',
      expected: { list: 403, detail: 403, view: 403 },
      hint: 'residents never receive videos.view — they use the self-scoped /videos/my routes',
      run: async (ctx, st) => ({
        list: (await http.get('/videos', { token: st.token })).status,
        detail: (await http.get(`/videos/${st.libraryId}`, { token: st.token })).status,
        view: (await http.post(`/videos/${st.libraryId}/view`, { token: st.token, body: {} })).status,
      }),
    },
    {
      id: 'VID-02',
      name: 'the self-scoped library returns globals and resolves playback to the resident\'s language',
      expected: { status: 200, sees_global: true, language: 'uk', playback_is_uk: true, in_my_language: true },
      run: async (ctx, st) => {
        const r = await http.get('/videos/my', { token: st.token });
        const v = (r.body?.data?.videos || []).find((x) => x.id === st.libraryId);
        return {
          status: r.status,
          sees_global: !!v,
          language: r.body?.data?.language,
          playback_is_uk: v?.playback_url === 'https://example.test/uk.mp4',
          in_my_language: v?.in_my_language,
        };
      },
    },
    {
      id: 'VID-03',
      name: 'a scoped video they were never sent stays invisible',
      expected: { visible_in_list: false, direct_fetch: 404 },
      hint: 'visibility = globally scoped OR personally sent; anything else is not theirs to see',
      run: async (ctx, st) => {
        const list = await http.get('/videos/my', { token: st.token });
        const direct = await http.get(`/videos/my/${st.hiddenId}`, { token: st.token });
        return {
          visible_in_list: (list.body?.data?.videos || []).some((v) => v.id === st.hiddenId),
          direct_fetch: direct.status,
        };
      },
    },
    {
      id: 'VID-04',
      name: 'a targeted send makes the video visible to that resident and nobody else',
      expected: { recipients: 1, now_visible: true, marked_as_sent: true, language_logged: 'uk' },
      run: async (ctx, st) => {
        const res = await st.announce.send(st.targetedId, { accommodation_ids: [ctx.ids.acc.t1] }, { isMandatory: true });
        st.announcementId = res.announcement_id;
        const list = await http.get('/videos/my', { token: st.token });
        const v = (list.body?.data?.videos || []).find((x) => x.id === st.targetedId);
        const rec = (await ctx.query(
          `SELECT language FROM video_announcement_recipients WHERE announcement_id=$1 AND user_id=$2`,
          [res.announcement_id, st.resUser])).rows[0];
        return {
          recipients: res.recipient_count,
          now_visible: !!v,
          marked_as_sent: v?.was_sent_to_me === true,
          language_logged: rec?.language,
        };
      },
    },
    {
      id: 'VID-05',
      name: 'watch evidence: the resident records progress on their OWN behalf only',
      expected: { status: 200, completed: true, stored_for_caller: 1, forged_for_other: 0 },
      hint: 'user_id comes from the token, never the body — evidence cannot be written for someone else',
      run: async (ctx, st) => {
        const r = await http.post(`/videos/my/${st.targetedId}/view`, {
          token: st.token, body: { progress_pct: 95, user_id: ctx.ids.user.superadmin },
        });
        const mine = (await ctx.query(
          `SELECT COUNT(*)::int c FROM video_views WHERE video_id=$1 AND user_id=$2`, [st.targetedId, st.resUser])).rows[0].c;
        const forged = (await ctx.query(
          `SELECT COUNT(*)::int c FROM video_views WHERE video_id=$1 AND user_id=$2`, [st.targetedId, ctx.ids.user.superadmin])).rows[0].c;
        return { status: r.status, completed: r.body?.data?.completed, stored_for_caller: mine, forged_for_other: forged };
      },
    },
    {
      id: 'VID-06',
      name: 'compliance shows SENT vs WATCHED — the evidence for a mandatory notice',
      expected: { sent: 1, watched: 1, watched_pct: 100, mandatory: true },
      run: async (ctx, st) => {
        const r = await http.get(`/video-comms/announcements/${st.announcementId}/compliance`, { token: st.superToken });
        const d = r.body?.data;
        return { sent: d?.sent, watched: d?.watched, watched_pct: d?.watched_pct, mandatory: d?.announcement?.is_mandatory };
      },
    },
    {
      id: 'VID-07',
      name: 'audience: an empty filter reaches NOBODY (blanket is never the default)',
      expected: { empty: 0, by_accommodation_gt0: true, all_gte_accommodation: true },
      run: async (ctx, st) => {
        const empty = await st.audience.resolve({});
        const byAcc = await st.audience.resolve({ accommodation_ids: [ctx.ids.acc.t1] });
        const all = await st.audience.resolve({ all: true });
        return {
          empty: empty.count,
          by_accommodation_gt0: byAcc.count > 0,
          all_gte_accommodation: all.count >= byAcc.count,
        };
      },
    },
    {
      id: 'VID-08',
      name: 'drip: a resident housed long before go-live gets day 1 ONLY, never a backlog',
      expected: { due_steps: [1], no_backlog: true },
      hint: 'the essential intro fires; everything they missed stays in the library instead of being pushed',
      run: async (ctx, st) => {
        const seq = (await ctx.query(
          `INSERT INTO video_sequences (name, anchor_type, audience, is_active)
           VALUES ($1,'move_in',$2,true) RETURNING id`,
          [`${ctx.tag} Lakhatasi alapok`, JSON.stringify({ accommodation_ids: [ctx.ids.acc.t1] })])).rows[0].id;
        for (const [d, v] of [[1, st.libraryId], [2, st.targetedId], [30, st.hiddenId]]) {
          await ctx.query(`INSERT INTO video_sequence_steps (sequence_id, video_id, day_offset) VALUES ($1,$2,$3)`, [seq, v, d]);
        }
        // Pretend they moved in 60 days ago — day-index 61, yet only step 1 may fire.
        await ctx.query(`UPDATE employees SET arrival_date = CURRENT_DATE - 60 WHERE id=$1`, [ctx.ids.emp.t1]);
        const due = await st.sequences.collectDue(st.sequences.localDateStr());
        const mine = due.filter((d) => d.recipient.user_id === st.resUser && d.sequence.id === seq);
        st.seqId = seq;
        return {
          due_steps: mine.map((d) => d.step.day_offset),
          no_backlog: !mine.some((d) => (d.step.day_offset || 0) > 1),
        };
      },
    },
    {
      id: 'VID-09',
      name: 'a step never fires twice for the same person, however often the job runs',
      expected: { duplicate_step_sends: 0, first_step_sent_once: 1, capped_at_one_per_day: true },
      hint: 'UNIQUE (sequence_id, step_id, user_id) + ON CONFLICT DO NOTHING, the expiry_alert_log pattern. '
          + 'A later run may legitimately send a DIFFERENT step once the daily cap frees up — what must never '
          + 'happen is the same step landing twice.',
      run: async (ctx, st) => {
        for (let i = 0; i < 3; i++) await st.sequences.runDaily({});
        const dupes = (await ctx.query(
          `SELECT COUNT(*)::int c FROM (
             SELECT sequence_id, step_id, user_id FROM video_sequence_sends
              GROUP BY 1,2,3 HAVING COUNT(*) > 1) x`)).rows[0].c;
        const firstStep = (await ctx.query(
          `SELECT COUNT(*)::int c FROM video_sequence_sends vs
             JOIN video_sequence_steps st ON st.id = vs.step_id
            WHERE vs.sequence_id=$1 AND st.day_offset = 1 AND vs.user_id=$2`, [st.seqId, st.resUser])).rows[0].c;
        const perDay = (await ctx.query(
          `SELECT COALESCE(MAX(c),0)::int m FROM (
             SELECT user_id, COUNT(*)::int c FROM video_sequence_sends WHERE sent_on = CURRENT_DATE GROUP BY user_id) x`)).rows[0].m;
        return { duplicate_step_sends: dupes, first_step_sent_once: firstStep, capped_at_one_per_day: perDay <= 1 };
      },
    },
    {
      id: 'VID-10',
      name: 'calendar sequence fires on its month-day and on no other day',
      expected: { on_the_day: true, other_day: 0 },
      run: async (ctx, st) => {
        const seq = (await ctx.query(
          `INSERT INTO video_sequences (name, anchor_type, audience, is_active)
           VALUES ($1,'calendar',$2,true) RETURNING id`,
          [`${ctx.tag} Unnepek`, JSON.stringify({ accommodation_ids: [ctx.ids.acc.t1] })])).rows[0].id;
        await ctx.query(`INSERT INTO video_sequence_steps (sequence_id, video_id, month_day) VALUES ($1,$2,'12-24')`,
          [seq, st.libraryId]);
        const onDay = await st.sequences.collectDue('2026-12-24');
        const offDay = await st.sequences.collectDue('2026-11-11');
        return {
          on_the_day: onDay.filter((d) => d.sequence.id === seq).length > 0,
          other_day: offDay.filter((d) => d.sequence.id === seq).length,
        };
      },
    },
    {
      id: 'VID-11',
      name: 'per-day cap holds across ALL sequences a resident is enrolled in',
      expected: { max_per_person_today: 1 },
      hint: 'video_delivery_config.max_videos_per_day; the rest defer to tomorrow rather than being dropped',
      run: async (ctx, st) => {
        await ctx.query(`UPDATE video_delivery_config SET max_videos_per_day = 1`);
        await ctx.query(`DELETE FROM video_sequence_sends`);
        await st.sequences.runDaily({});
        const r = (await ctx.query(
          `SELECT COALESCE(MAX(c),0)::int m FROM (
             SELECT user_id, COUNT(*)::int c FROM video_sequence_sends WHERE sent_on = CURRENT_DATE GROUP BY user_id) x`)).rows[0].m;
        return { max_per_person_today: r };
      },
    },
    {
      id: 'VID-12',
      name: 'library search + category filter work over the resident\'s own visible set',
      expected: { search_hit: true, category_filter_works: true, categories_present: true },
      run: async (ctx, st) => {
        const search = await http.get('/videos/my', { token: st.token, query: { search: 'Konyha' } });
        const cat = await http.get('/videos/my', { token: st.token, query: { category: 'lakhatas' } });
        const all = await http.get('/videos/my', { token: st.token });
        return {
          search_hit: (search.body?.data?.videos || []).some((v) => v.id === st.libraryId),
          category_filter_works: (cat.body?.data?.videos || []).every((v) => v.category === 'lakhatas'),
          categories_present: (all.body?.data?.categories || []).length > 0,
        };
      },
    },
  ],
};
