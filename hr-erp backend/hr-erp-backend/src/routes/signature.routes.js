/**
 * Aláírás-útvonalak. EGY családban mind a négy dokumentumtípusra.
 *
 * Jogosultság: `inspections.edit` — az aláíratás a helyszíni munka része, ugyanaz a
 * kör végzi, mint az ellenőrzést. Pénzügyi jogot NEM kíván: a szállásfelelősnek
 * aláíratnia kell tudnia, pénzügyi adatot látnia viszont nem (állandó kikötés).
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const ctrl = require('../controllers/signature.controller');

// A nyilatkozat szövege mind az 5 nyelven. A `/:subjectType/:subjectId` ELŐTT áll,
// különben a "texts" azonosítóként értelmeződne.
router.get('/texts', authenticateToken, ctrl.getTexts);

router.get('/:subjectType/:subjectId', authenticateToken, ctrl.list);
router.post('/:subjectType/:subjectId',
  authenticateToken, checkPermission('inspections.edit'), ctrl.create);

module.exports = router;
