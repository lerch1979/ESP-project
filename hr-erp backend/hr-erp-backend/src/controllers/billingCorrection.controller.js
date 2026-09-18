/**
 * Számlakorrekció-végpontok. A szolgáltatás tartja a szabályokat, ez csak a HTTP-réteg.
 *
 * A jóváhagyás külön hívás, nem a javaslat mellékhatása: a levonás valódi pénz, és a
 * foglaltsági adat, amiből a javaslat készül, emberi átvezetésen múlik.
 */
const svc = require('../services/billingCorrection.service');
const { logger } = require('../utils/logger');
const { logActivity } = require('../utils/activityLogger');
const { isValidUUID } = require('../utils/validation');

const propose = async (req, res) => {
  try {
    const r = await svc.propose({
      contractorId: req.body?.contractor_id,
      month: req.body?.affected_month,
      invoicedAmount: req.body?.invoiced_amount,
      invoicedBreakdown: req.body?.invoiced_breakdown || [],
      note: req.body?.note || null,
      userId: req.user.id,
    });
    if (r.error) return res.status(r.status || 400).json({ success: false, message: r.error, data: r.data });

    const c = r.data.correction;
    await logActivity({
      userId: req.user.id, entityType: 'billing_correction', entityId: c.id, action: 'propose',
      changes: { honap: c.affected_month, kiszamlazott: c.invoiced_amount, tenyleges: c.actual_amount, kulonbozet: c.amount },
    });
    res.status(201).json({
      success: true,
      message: r.data.coverage.complete
        ? `Javaslat: ${Number(c.amount).toLocaleString('hu-HU')} Ft visszavezetése`
        : `Javaslat elkészült, DE a hónapból csak ${r.data.coverage.days_with_data}/${r.data.coverage.days_in_month} `
          + 'napra van foglaltsági adat — a különbözet egy része hiányzó adat lehet, nem túlszámlázás.',
      data: r.data,
    });
  } catch (e) {
    logger.error('Korrekció-javaslat hiba:', e);
    res.status(500).json({ success: false, message: 'Korrekció-javaslat hiba' });
  }
};

const approve = async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ success: false, message: 'Érvénytelen azonosító' });
    const r = await svc.approve({ id: req.params.id, userId: req.user.id });
    if (r.error) return res.status(r.status || 400).json({ success: false, message: r.error });
    await logActivity({
      userId: req.user.id, entityType: 'billing_correction', entityId: req.params.id, action: 'approve',
      changes: { osszeg: r.data.correction.amount },
    });
    res.json({ success: true, message: 'Korrekció jóváhagyva — mostantól rákerülhet a számlára', data: r.data });
  } catch (e) {
    logger.error('Korrekció-jóváhagyási hiba:', e);
    res.status(500).json({ success: false, message: 'Jóváhagyási hiba' });
  }
};

const reject = async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ success: false, message: 'Érvénytelen azonosító' });
    const r = await svc.reject({ id: req.params.id, note: req.body?.note || null });
    if (r.error) return res.status(r.status || 400).json({ success: false, message: r.error });
    await logActivity({
      userId: req.user.id, entityType: 'billing_correction', entityId: req.params.id, action: 'reject',
    });
    res.json({ success: true, message: 'Korrekció elvetve', data: r.data });
  } catch (e) {
    logger.error('Korrekció-elvetési hiba:', e);
    res.status(500).json({ success: false, message: 'Elvetési hiba' });
  }
};

const settle = async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return res.status(400).json({ success: false, message: 'Érvénytelen azonosító' });
    const r = await svc.settle({
      id: req.params.id, month: req.body?.month, amount: req.body?.amount, userId: req.user.id,
    });
    if (r.error) return res.status(r.status || 400).json({ success: false, message: r.error });
    await logActivity({
      userId: req.user.id, entityType: 'billing_correction', entityId: req.params.id, action: 'settle',
      changes: { beszamitva: r.data.settled, marad: r.data.remaining, honap: req.body?.month },
    });
    res.json({
      success: true,
      message: r.data.remaining > 0
        ? `${r.data.settled.toLocaleString('hu-HU')} Ft beszámítva, ${r.data.remaining.toLocaleString('hu-HU')} Ft marad nyitva`
        : `${r.data.settled.toLocaleString('hu-HU')} Ft beszámítva — a korrekció rendezve`,
      data: r.data,
    });
  } catch (e) {
    logger.error('Korrekció-beszámítási hiba:', e);
    res.status(500).json({ success: false, message: 'Beszámítási hiba' });
  }
};

const open = async (req, res) => {
  try {
    const out = await svc.open({ contractorId: req.query.contractor_id || null });
    res.json({ success: true, data: out });
  } catch (e) {
    logger.error('Korrekció-lista hiba:', e);
    res.status(500).json({ success: false, message: 'Lekérdezési hiba' });
  }
};

module.exports = { propose, approve, reject, settle, open };
