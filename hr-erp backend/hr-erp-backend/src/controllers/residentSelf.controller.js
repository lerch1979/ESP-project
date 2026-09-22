/**
 * Resident self-service controllers — STRICTLY self-scoped.
 *
 * These power the auth-only /tickets/my, /tickets/my/:id and
 * /accommodations/my endpoints used by the resident (accommodated_employee)
 * mobile app. They are mounted BEFORE the staff /tickets and /accommodations
 * routers so staff route code stays untouched.
 *
 * Every query is filtered to the requesting user:
 *   - tickets: created_by = req.user.id   (their OWN tickets only)
 *   - room:    employees.user_id = req.user.id  (their OWN accommodation only)
 *
 * No permission gate (auth-only), mirroring the notification-center pattern.
 * Row-level scoping here is the ONLY thing standing between a resident and
 * other tenants' data — do not loosen these WHERE clauses.
 */

const path = require('path');
const inApp = require('../services/inAppNotification.service');
const fs = require('fs');
const sharp = require('sharp');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const categoryAI = require('../services/categoryAI.service');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMP_UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'employees');

// Min confidence to pre-select a category. Below this, return null (manual pick)
// so the resident never sees a visibly-wrong guess.
const SUGGEST_CONFIDENCE_THRESHOLD = 70;

// GET /tickets/my — only tickets the resident created.
/**
 * MIT LÁT A LAKÓ A SAJÁT JEGYEIBŐL — egy helyen, három használati hely helyett.
 *
 * Eddig `created_by = $1` volt, azaz KIZÁRÓLAG a bejelentő. Emiatt egy irodából, a lakó
 * NEVÉBEN nyitott jegy (élesben a #21: az iroda nyitotta, az érintett Eszti volt) soha
 * nem jelent meg a lakó appjában: dolgoztunk az ügyén, ő meg nem tudott róla.
 *
 * Mostantól VAGY-kapcsolat: a lakó látja azt is, amit ő jelentett be, ÉS azt is, ami RÁ
 * vonatkozik. A kettő kizárólagossá tétele hibás lenne mindkét irányban:
 *   • csak a bejelentőre szűrve az irodai jegyek maradnak láthatatlanok,
 *   • csak az érintettre szűrve a lakó SAJÁT, korábbi jegyei (#19, #20) tűnnének el —
 *     azoknál ugyanis a linked_employee_id üres, mert a lakói jegynyitás eddig nem
 *     töltötte ki. (Ezentúl kitölti, de a meglévő sorok nem változnak visszamenőleg.)
 *
 * A feltétel SQL-töredékként él, nem másolt sorokként: ha háromfelé írnánk, egy jövőbeli
 * szigorítás könnyen kimaradna az egyikből — és az adatszivárgás felé mindig a kimaradás
 * a veszélyes irány.
 */
const SAJAT_JEGY_FELTETEL = `(
  t.created_by = $USER
  OR t.linked_employee_id IN (SELECT id FROM employees WHERE user_id = $USER)
)`;
/** A $USER helyőrző cseréje a tényleges paraméter-sorszámra. */
const sajatJegy = (paramIndex) => SAJAT_JEGY_FELTETEL.replace(/\$USER/g, `$${paramIndex}`);

const getMyTickets = async (req, res) => {
  try {
    const result = await query(
      `SELECT
         t.id, t.ticket_number, t.title, t.description, t.language,
         t.created_at, t.updated_at, t.due_date, t.resolved_at, t.closed_at,
         ts.name as status_name, ts.slug as status_slug, ts.color as status_color, ts.is_final,
         tc.name as category_name, tc.slug as category_slug, tc.color as category_color, tc.icon as category_icon,
         p.name as priority_name, p.slug as priority_slug, p.level as priority_level, p.color as priority_color
       FROM tickets t
       LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
       LEFT JOIN ticket_categories tc ON t.category_id = tc.id
       LEFT JOIN priorities p ON t.priority_id = p.id
       WHERE ${sajatJegy(1)}
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: { tickets: result.rows } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Hiba a hibajegyek lekérésekor' });
  }
};

// GET /tickets/my/:id — that ticket ONLY if the resident created it; else 404
// (404 not 403 — do not reveal the existence of other tenants' tickets).
const getMyTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      return res.status(404).json({ success: false, message: 'Hibajegy nem található' });
    }
    const result = await query(
      `SELECT
         t.*, ts.name as status_name, ts.slug as status_slug, ts.color as status_color,
         tc.name as category_name, tc.slug as category_slug, tc.color as category_color,
         p.name as priority_name, p.slug as priority_slug, p.level as priority_level, p.color as priority_color
       FROM tickets t
       LEFT JOIN ticket_statuses ts ON t.status_id = ts.id
       LEFT JOIN ticket_categories tc ON t.category_id = tc.id
       LEFT JOIN priorities p ON t.priority_id = p.id
       WHERE t.id = $1 AND ${sajatJegy(2)}`,
      [id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Hibajegy nem található' });
    }
    // Actual attachment rows on disk (honest count — partial uploads show real state).
    const att = await query(
      `SELECT id, file_name, mime_type, file_size, created_at
         FROM ticket_attachments WHERE ticket_id = $1 ORDER BY created_at ASC`,
      [id]
    );
    res.json({ success: true, data: { ticket: { ...result.rows[0], attachments: att.rows } } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Hiba a hibajegy lekérésekor' });
  }
};

// GET /accommodations/my — the resident's OWN accommodation (room) only.
const getMyAccommodation = async (req, res) => {
  try {
    const result = await query(
      `SELECT a.*, e.room_number as my_room_number,
              e.first_name as my_first_name, e.last_name as my_last_name
       FROM employees e
       JOIN accommodations a ON a.id = e.accommodation_id
       WHERE e.user_id = $1 AND e.end_date IS NULL
       LIMIT 1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Nincs hozzád rendelt szállás' });
    }
    res.json({ success: true, data: { accommodation: result.rows[0] } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Hiba a szállás lekérésekor' });
  }
};

// Guard for the resident ticket-chat routes: the :ticketId path param MUST be
// a ticket the resident created. 404 (not 403) so other tenants' ticket
// existence isn't revealed. This is the ONLY ownership scope — the reused
// ticketMessages.list/send do NOT self-scope (their _detectSenderRole returns
// a role for any existing ticket), so this guard must run before them.
/**
 * A LAKÓNAK SZÓLÓ feladatai — és KIZÁRÓLAG azok.
 *
 * ⚠️ A SZŰRÉS SZÁNDÉKOSAN SZŰK: csak `assigned_to_employee_id`. A `related_employee_id`
 * a lakóRÓL szóló BELSŐ feladatot jelöli ("beszélni kell vele a rendetlenség miatt") —
 * annak a lakó telefonján semmi keresnivalója. Ez nem szépséghiba, hanem bizalmi kérdés:
 * egy ilyen szivárgás után a lakó joggal nem hinné el, hogy bármi más privát maradt.
 *
 * A VÁLASZ MEZŐI IS SZŰKÍTETTEK. A `tasks` tábla tele van belső munkaszervezési adattal
 * (gtd_status, energy_level, waiting_for, estimated_hours, belső leírás), és egy
 * `SELECT t.*` ezeket mind kiadná. Ezért tételes mezőlista megy ki, nem csillag.
 */
const getMyTasks = async (req, res) => {
  try {
    const result = await query(
      `SELECT
         t.id, t.title, t.description, t.due_date, t.priority,
         t.resident_status, t.resident_status_at, t.resident_note, t.created_at
       FROM tasks t
       JOIN employees e ON e.id = t.assigned_to_employee_id
       WHERE e.user_id = $1
       ORDER BY (t.resident_status = 'kesz'), t.due_date NULLS LAST, t.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: { tasks: result.rows } });
  } catch (err) {
    logger.error(`[residentSelf.getMyTasks] ${err.message}`);
    res.status(500).json({ success: false, message: 'Hiba a feladatok betöltésekor' });
  }
};

/**
 * A lakó visszajelzése: láttam / folyamatban / kész.
 *
 * NEM a `status` mezőt írja. Az az IRODA munkafolyamata (todo / review / done); ez azt
 * rögzíti, mit üzent vissza a lakó. A kettő elcsúszhat — a lakó jelezheti, hogy kész, az
 * iroda meg még ellenőrizni akarja —, és ez így helyes. Ha a lakó közvetlenül a `status`-t
 * állítaná, egy "kész" gombnyomással kikerülne az iroda ellenőrzése alól.
 */
const setMyTaskStatus = async (req, res) => {
  try {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      return res.status(404).json({ success: false, message: 'Feladat nem található' });
    }
    const allapot = req.body?.status;
    if (!['lattam', 'folyamatban', 'kesz'].includes(allapot)) {
      return res.status(400).json({ success: false, message: 'Érvénytelen állapot' });
    }

    // A WHERE ugyanazt a szűkítést ismétli, mint a lista — egy feladatot, ami nem NEKI
    // szól, nem lehet "megjelölni" sem. A 404 szándékos: nem áruljuk el, hogy létezik.
    const r = await query(
      `UPDATE tasks t
          SET resident_status = $3, resident_status_at = NOW(),
              resident_note = COALESCE($4, t.resident_note), updated_at = NOW()
         FROM employees e
        WHERE e.id = t.assigned_to_employee_id AND e.user_id = $2 AND t.id = $1
        RETURNING t.id, t.title, t.resident_status, t.resident_status_at`,
      [id, req.user.id, allapot, req.body?.note || null]
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Feladat nem található' });
    }

    // Az IRODA tudjon róla, hogy a lakó mozdult — enélkül a visszajelzés egy mezőben ülne.
    const felelos = await query('SELECT assigned_to, created_by FROM tasks WHERE id = $1', [id]);
    const cimzett = felelos.rows[0]?.assigned_to || felelos.rows[0]?.created_by || null;
    if (cimzett) {
      const CIMKE = { lattam: 'Látta', folyamatban: 'Folyamatban', kesz: 'Kész' };
      inApp.notify({
        userId: cimzett,
        type: 'task_assigned',
        title: `Lakói visszajelzés: ${CIMKE[allapot]}`,
        message: r.rows[0].title,
        link: `/tasks/${id}`,
        data: { task_id: id, resident_status: allapot },
      }).catch((e) => logger.warn(`[residentSelf.setMyTaskStatus] értesítés: ${e.message}`));
    }

    res.json({ success: true, message: 'Köszönjük a visszajelzést', data: r.rows[0] });
  } catch (err) {
    logger.error(`[residentSelf.setMyTaskStatus] ${err.message}`);
    res.status(500).json({ success: false, message: 'Hiba a visszajelzés rögzítésekor' });
  }
};

const requireOwnTicket = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    if (!UUID_RE.test(ticketId)) {
      return res.status(404).json({ success: false, message: 'Hibajegy nem található' });
    }
    // Ugyanaz a feltétel, mint a listánál és a részleteknél — az őr nem lehet szigorúbb
    // vagy lazább, mint amit a lakó egyébként lát, különben az üzenetküldés és a
    // képfeltöltés elválik a jegy láthatóságától.
    const r = await query(
      `SELECT t.id FROM tickets t WHERE t.id = $1 AND ${sajatJegy(2)}`,
      [ticketId, req.user.id]);
    if (r.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Hibajegy nem található' });
    }
    next();
  } catch (err) {
    res.status(500).json({ success: false, message: 'Hiba a hibajegy ellenőrzésekor' });
  }
};

// Resident's OWN contractor categories (the curated set for their housing
// provider), NOT the global staff taxonomy. Keeps the report picker short and
// fully translated — a resident never sees other contractors'/staff categories.
const getMyCategories = async (req, res) => {
  try {
    const r = await query(
      `SELECT id, name, slug, color, icon
         FROM ticket_categories
        WHERE contractor_id = $1 AND is_active = TRUE
        ORDER BY name`,
      [req.user.contractorId],
    );
    res.json({ success: true, data: { categories: r.rows } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Hiba a kategóriák lekérésekor' });
  }
};

// POST /tickets/my/suggest-category — "AI suggests, resident confirms".
// Classifies the typed description against the resident's OWN curated 6
// categories (same contractor-scoped set as getMyCategories — NEVER the global
// taxonomy) and returns a pre-selectable category, but only when the model is
// confident (>= threshold). Failure-invisible: any error / low confidence / no
// key returns { category_id: null } so the form silently falls back to manual.
const suggestMyCategory = async (req, res) => {
  try {
    const description = typeof req.body?.description === 'string' ? req.body.description : '';

    // The resident's OWN categories — the ONLY slugs a suggestion may resolve to.
    const cats = await query(
      `SELECT id, slug, name
         FROM ticket_categories
        WHERE contractor_id = $1 AND is_active = TRUE`,
      [req.user.contractorId],
    );
    if (cats.rows.length === 0) {
      return res.json({ success: true, data: { category_id: null } });
    }

    const suggestion = await categoryAI.suggestCategory(
      description,
      cats.rows.map((c) => ({ slug: c.slug, name: c.name })),
    );

    if (!suggestion || suggestion.confidence < SUGGEST_CONFIDENCE_THRESHOLD) {
      return res.json({ success: true, data: { category_id: null } });
    }

    // Map the slug back to an id WITHIN the resident's own set (belt-and-braces
    // isolation: even a hallucinated slug can't escape these 6 rows).
    const match = cats.rows.find((c) => c.slug === suggestion.slug);
    if (!match) {
      return res.json({ success: true, data: { category_id: null } });
    }

    res.json({
      success: true,
      data: { category_id: match.id, slug: match.slug, confidence: suggestion.confidence },
    });
  } catch (err) {
    // Never surface an error here — suggestion is optional, fall back to manual.
    res.json({ success: true, data: { category_id: null } });
  }
};

// ============================================================================
// Resident profile photo — SELF-SCOPED (the caller's OWN employee row only,
// resolved by employees.user_id = req.user.id; a resident can never touch
// another resident's photo). Reuses the same sharp pipeline + on-disk layout
// as the admin uploader (uploads/employees/<thumb|orig>_<ts>.jpg, in the
// backed-up uploads_data volume). The thumbnail URL is stored in
// employees.profile_photo_url, which the admin UI already renders.
//
// GDPR: PROFILE PICTURE ONLY. The image is display-only and is NEVER run
// through face-recognition or any biometric processing — this preserves the
// "no biometrics" compliance positioning. Upload is OPTIONAL; the resident is
// told (in-app) that administrators can see it.
// ============================================================================

// GET /employees/my — the caller's own employee basics + current photo URL.
const getMyEmployee = async (req, res) => {
  try {
    const r = await query(
      'SELECT id, first_name, last_name, profile_photo_url FROM employees WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Nincs munkavállalói profil' });
    }
    return res.json({ success: true, data: r.rows[0] });
  } catch (err) {
    logger.error('[residentSelf.getMyEmployee]', err.message);
    return res.status(500).json({ success: false, message: 'Profil betöltési hiba' });
  }
};

// POST /employees/my/photo — self-scoped upload (multipart field 'photo').
const uploadMyPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Kép feltöltése kötelező' });
    }
    const emp = await query(
      'SELECT id, profile_photo_url FROM employees WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    );
    if (emp.rows.length === 0) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ success: false, message: 'Nincs munkavállalói profil' });
    }
    const employeeId = emp.rows[0].id;
    const oldPhotoUrl = emp.rows[0].profile_photo_url;
    const timestamp = Date.now();

    const thumbFilename = `thumb_${timestamp}.jpg`;
    await sharp(req.file.path)
      .resize(300, 300, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toFile(path.join(EMP_UPLOAD_DIR, thumbFilename));

    const origFilename = `orig_${timestamp}.jpg`;
    await sharp(req.file.path)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(path.join(EMP_UPLOAD_DIR, origFilename));

    fs.unlink(req.file.path, () => {});

    if (oldPhotoUrl) {
      const oldThumb = path.join(__dirname, '..', '..', oldPhotoUrl);
      fs.unlink(oldThumb, () => {});
      fs.unlink(oldThumb.replace('thumb_', 'orig_'), () => {});
    }

    const profilePhotoUrl = `/uploads/employees/${thumbFilename}`;
    await query(
      'UPDATE employees SET profile_photo_url = $1, updated_at = NOW() WHERE id = $2',
      [profilePhotoUrl, employeeId]
    );
    logger.info('Saját profilkép feltöltve', { employeeId });
    return res.json({ success: true, data: { profile_photo_url: profilePhotoUrl } });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    logger.error('[residentSelf.uploadMyPhoto]', err.message);
    return res.status(500).json({ success: false, message: 'Profilkép feltöltési hiba' });
  }
};

// DELETE /employees/my/photo — self-scoped remove.
const deleteMyPhoto = async (req, res) => {
  try {
    const emp = await query(
      'SELECT id, profile_photo_url FROM employees WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    );
    if (emp.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Nincs munkavállalói profil' });
    }
    const photoUrl = emp.rows[0].profile_photo_url;
    if (!photoUrl) {
      return res.status(400).json({ success: false, message: 'Nincs profilkép' });
    }
    const thumbPath = path.join(__dirname, '..', '..', photoUrl);
    fs.unlink(thumbPath, () => {});
    fs.unlink(thumbPath.replace('thumb_', 'orig_'), () => {});
    await query(
      'UPDATE employees SET profile_photo_url = NULL, updated_at = NOW() WHERE id = $1',
      [emp.rows[0].id]
    );
    logger.info('Saját profilkép törölve', { employeeId: emp.rows[0].id });
    return res.json({ success: true, message: 'Profilkép törölve' });
  } catch (err) {
    logger.error('[residentSelf.deleteMyPhoto]', err.message);
    return res.status(500).json({ success: false, message: 'Profilkép törlési hiba' });
  }
};

module.exports = {
  getMyTasks,
  setMyTaskStatus, getMyTickets, getMyTicketById, getMyAccommodation, requireOwnTicket, getMyCategories, suggestMyCategory, getMyEmployee, uploadMyPhoto, deleteMyPhoto };
