/**
 * A LAKÓ saját aláírás-útvonalai.
 *
 * Nincs `checkPermission`: a lakónak nincs és nem is lesz `inspections.edit` joga.
 * A korlát tételes — a kontroller minden kérésnél megnézi, hogy a dokumentum RÁ
 * vonatkozik-e. Egy jogosultság-alapú kapu itt túl tág lenne: attól még, hogy valaki
 * lakó, nem írhatja alá MÁSIK lakó kárjegyzőkönyvét.
 */
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const ctrl = require('../controllers/residentSignature.controller');

// A `/pending` a `/:subjectType` ELŐTT — különben "pending" típusként értelmeződne.
router.get('/my/pending', authenticateToken, ctrl.pending);
router.get('/my/:subjectType/:subjectId/text', authenticateToken, ctrl.myText);
router.post('/my/:subjectType/:subjectId', authenticateToken, ctrl.mySign);

module.exports = router;
