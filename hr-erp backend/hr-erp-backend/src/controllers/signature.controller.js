/**
 * signature.controller — EGY végpontcsalád mind a négy dokumentumtípusra.
 *
 * Szándékosan nem dokumentumtípusonként külön útvonal: a négy típus különbsége a
 * nyilatkozat SZÖVEGE, nem a folyamat. Négy útvonalból három előbb-utóbb lemaradna
 * egy javításról.
 */
const signatures = require('../services/signature.service');
const { ellenorzesParamok, pillanatkep, megorzes } = require('./signature.controller.helpers');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');
const inspHtmlPdf = require('../services/inspectionHtmlPdf.service');
const signedArchive = require('../services/signedArchive.service');

/** A nyilatkozat szövege mind az 5 nyelven — ezt mutatja a felület aláírás előtt. */
const getTexts = async (req, res) => {
  try {
    const { subjectType, signerRole, subjectId } = req.query;
    if (!signatures.TARGYAK.includes(subjectType)
        || !signatures.SZEREPEK.includes(signerRole)) {
      return res.status(400).json({ success: false, message: 'Ismeretlen típus vagy szerep' });
    }
    // Az ellenőrzésnél a szöveg a KONKRÉT eredményt tartalmazza, tehát tudnunk kell,
    // melyik ellenőrzésről van szó. A felület ugyanazt a szöveget mutatja, amit aztán
    // aláír — ha a kettő eltérne, az aláírás nem arról szólna, amit elolvasott.
    const params = (subjectType === 'inspection' && signerRole === 'resident' && subjectId)
      ? await ellenorzesParamok(subjectId) : {};
    res.json({
      success: true,
      data: { texts: signatures.nyilatkozatMind(subjectType, signerRole, params) },
    });
  } catch (e) {
    logger.error(`[signature.getTexts] ${e.message}`);
    res.status(e.status || 500).json({ success: false, message: e.message });
  }
};

const list = async (req, res) => {
  try {
    const rows = await signatures.listFor(req.params.subjectType, req.params.subjectId);
    res.json({ success: true, data: { signatures: rows } });
  } catch (e) {
    logger.error(`[signature.list] ${e.message}`);
    res.status(500).json({ success: false, message: 'Hiba történt' });
  }
};

const create = async (req, res) => {
  try {
    const { subjectType, subjectId } = req.params;
    const {
      signer_role, signer_name, signer_employee_id, signer_user_id,
      language, signature_png, refusal_reason, signed_on,
    } = req.body;

    const kep = await pillanatkep(subjectType, subjectId);
    if (!kep) {
      return res.status(404).json({ success: false, message: 'A dokumentum nem található' });
    }

    const r = await signatures.sign({
      subjectType, subjectId,
      signerRole: signer_role,
      signerName: signer_name,
      signerEmployeeId: signer_employee_id,
      signerUserId: signer_user_id,
      language,
      textParams: (subjectType === 'inspection' && signer_role === 'resident')
        ? await ellenorzesParamok(subjectId) : {},
      snapshot: kep,
      signaturePng: signature_png,
      refusalReason: refusal_reason,
      // Alapeset a személyzeti készülék: a szállásfelelős odaadja a telefont. A saját
      // telefonos aláírást a lakói végpont állítja 'own_phone'-ra.
      signedOn: signed_on || 'staff_device',
      req,
      operatorUserId: req.user.id,
    });
    // AZ ALÁÍRT PÉLDÁNY MEGŐRZÉSE — a válasz UTÁN, a kérés útján KÍVÜL.
    // A PDF-gyártás Chrome-ot indít: lassú, és elbukhat. A helyszínen álló lakó
    // aláírása nem múlhat ezen, ezért előbb válaszolunk, és csak utána archiválunk.
    // Ha nem sikerül, a letöltés a pillanatképből renderel — a tartalom akkor is hű.
    res.status(201).json({ success: true, data: r });
    megorzes(subjectType, subjectId, language, r.id).catch((e) => {
      logger.warn(`[signature] a megőrzés nem sikerült (${subjectType}/${subjectId}): ${e.message}`);
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, message: e.message });
    // Az egyedi index: egy szerep egyszer ír alá. Ez NEM technikai hiba, hanem
    // érdemi állapot — mondjuk is ki, ne "Hiba történt"-et.
    if (e.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Ez a szerep már aláírta ezt a dokumentumot. '
          + 'Újraaláíráshoz a meglévőt vissza kell vonni.',
      });
    }
    logger.error(`[signature.create] ${e.message}`);
    res.status(500).json({ success: false, message: 'Az aláírás rögzítése nem sikerült' });
  }
};

module.exports = { getTexts, list, create };
