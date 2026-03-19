/**
 * Damage Report PDF/DOCX Generation
 * Generates professional Hungarian-language damage reports (Kárigény Jegyzőkönyv)
 * Compliant with Mt. 166.§, 177.§, Ptk. 6:142.§
 */
const PDFDocument = require('pdfkit');
const { logger } = require('../utils/logger');

const LIABILITY_LABELS = {
  intentional: 'Szándékos károkozás',
  negligence: 'Gondatlanság',
  normal_wear: 'Rendeltetésszerű használat / természetes elhasználódás',
  force_majeure: 'Vis maior (elháríthatatlan külső ok)',
};

const STATUS_LABELS = {
  draft: 'Tervezet',
  pending_review: 'Felülvizsgálat alatt',
  pending_acknowledgment: 'Aláírásra vár',
  acknowledged: 'Tudomásul véve',
  in_payment: 'Fizetés alatt',
  paid: 'Kifizetve',
  disputed: 'Vitatott',
  cancelled: 'Visszavonva',
};

function formatDate(date) {
  if (!date) return '_______________';
  const d = new Date(date);
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, '0')}. ${String(d.getDate()).padStart(2, '0')}.`;
}

function formatCurrency(amount) {
  return `${Math.round(amount || 0).toLocaleString('hu-HU')} Ft`;
}

// ─── PDF Generation ─────────────────────────────────────────────────

function generatePDF(report) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 60, bottom: 60, left: 60, right: 60 },
        info: {
          Title: `Kárigény Jegyzőkönyv - ${report.report_number}`,
          Author: 'Housing Solutions Kft.',
        },
      });

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const pageWidth = doc.page.width - 120; // margins

      // ── Header ──
      doc.fontSize(10).fillColor('#666')
        .text('Housing Solutions Kft.', 60, 30, { align: 'left' })
        .text('Munkaerő Stabilitási Platform', { align: 'left' });

      doc.fontSize(20).fillColor('#1E40AF').font('Helvetica-Bold')
        .text('KÁRIGÉNY JEGYZŐKÖNYV', 60, 80, { align: 'center' });

      doc.fontSize(12).fillColor('#333').font('Helvetica')
        .text(`Jegyzőkönyv száma: ${report.report_number}`, { align: 'center' })
        .text(`Kelt: ${formatDate(report.created_at)}`, { align: 'center' });

      doc.moveDown(1.5);
      drawLine(doc);

      // ── Section 1: Azonosító adatok ──
      sectionTitle(doc, '1. AZONOSÍTÓ ADATOK');

      const empName = `${report.employee_first_name || ''} ${report.employee_last_name || ''}`.trim() || 'N/A';
      tableRow(doc, 'Munkavállaló neve:', empName);
      tableRow(doc, 'E-mail:', report.employee_email || 'N/A');
      tableRow(doc, 'Munkáltató / Alvállalkozó:', report.contractor_name || 'N/A');
      tableRow(doc, 'Esemény dátuma:', formatDate(report.incident_date));
      tableRow(doc, 'Felfedezés dátuma:', formatDate(report.discovery_date));

      // ── Section 2: Kár helyszíne ──
      sectionTitle(doc, '2. KÁR HELYSZÍNE');
      tableRow(doc, 'Szállás:', report.accommodation_id || 'N/A');
      tableRow(doc, 'Szoba/Egység:', report.room_id || 'N/A');

      if (report.ticket_id) {
        tableRow(doc, 'Kapcsolódó jegy:', `Ticket #${report.ticket_id.substring(0, 8)}`);
      }

      // ── Section 3: Kár leírása ──
      sectionTitle(doc, '3. KÁR LEÍRÁSA');
      doc.fontSize(10).font('Helvetica')
        .text(report.description || 'Nincs leírás megadva.', { width: pageWidth });
      doc.moveDown(0.5);

      // ── Section 4: Fotódokumentáció ──
      sectionTitle(doc, '4. FOTÓDOKUMENTÁCIÓ');
      const photoCount = (report.photo_urls || []).length;
      doc.fontSize(10)
        .text(`Csatolt fotók száma: ${photoCount} db`);
      doc.moveDown(0.5);

      // ── Section 5: Felróhatóság ──
      sectionTitle(doc, '5. FELRÓHATÓSÁG');

      const liabilityTypes = ['intentional', 'negligence', 'normal_wear', 'force_majeure'];
      liabilityTypes.forEach((type) => {
        const checked = report.liability_type === type ? '☑' : '☐';
        doc.fontSize(10).text(`  ${checked}  ${LIABILITY_LABELS[type]}`);
      });
      doc.moveDown(0.3);
      tableRow(doc, 'Vétkesség mértéke:', `${report.fault_percentage || 100}%`);

      // ── Section 6: Költségkalkuláció ──
      checkNewPage(doc);
      sectionTitle(doc, '6. KÖLTSÉGKALKULÁCIÓ');

      const items = report.damage_items || [];
      if (items.length > 0) {
        // Table header
        doc.fontSize(9).font('Helvetica-Bold');
        const colX = [60, 260, 380];
        doc.text('Tétel megnevezése', colX[0], doc.y, { width: 195 });
        doc.text('Leírás', colX[1], doc.y - 12, { width: 115 });
        doc.text('Összeg (Ft)', colX[2], doc.y - 12, { width: 100, align: 'right' });
        doc.moveDown(0.3);
        drawLine(doc);

        doc.font('Helvetica').fontSize(9);
        items.forEach((item) => {
          const y = doc.y;
          doc.text(item.name || '-', colX[0], y, { width: 195 });
          doc.text(item.description || '-', colX[1], y, { width: 115 });
          doc.text(formatCurrency(item.cost), colX[2], y, { width: 100, align: 'right' });
          doc.moveDown(0.2);
        });

        drawLine(doc);
        doc.font('Helvetica-Bold').fontSize(10);
        doc.text('ÖSSZESEN:', colX[0], doc.y);
        doc.text(formatCurrency(report.total_cost), colX[2], doc.y - 12, { width: 100, align: 'right' });
        doc.moveDown(0.3);

        if (report.fault_percentage < 100) {
          const adjusted = (parseFloat(report.total_cost) || 0) * (report.fault_percentage / 100);
          doc.font('Helvetica').fontSize(9)
            .text(`Vétkesség mértékével korrigált összeg (${report.fault_percentage}%): ${formatCurrency(adjusted)}`);
        }
      } else {
        doc.fontSize(10).text('Nincs tételes kár megadva.');
      }
      doc.moveDown(0.5);

      // ── Section 7: Payment Plan ──
      const plan = report.payment_plan || [];
      if (plan.length > 0) {
        sectionTitle(doc, '7. TÖRLESZTÉSI TERV (Mt. 177. §)');
        doc.fontSize(9)
          .text('A munkaviszonyból származó kártérítés a munkavállaló havi bérének legfeljebb 50%-a erejéig vonható le.');
        doc.moveDown(0.3);

        if (report.employee_salary) {
          tableRow(doc, 'Havi bruttó bér:', formatCurrency(report.employee_salary));
          tableRow(doc, 'Max. havi levonás (50%):', formatCurrency(report.employee_salary * 0.5));
          tableRow(doc, 'Törlesztés időtartama:', `${plan.length} hónap`);
        }
        doc.moveDown(0.5);
      }

      // ── Section 8: Nyilatkozat ──
      checkNewPage(doc);
      sectionTitle(doc, `${plan.length > 0 ? '8' : '7'}. MUNKAVÁLLALÓI NYILATKOZAT`);
      doc.fontSize(9).font('Helvetica')
        .text(
          'Alulírott munkavállaló kijelentem, hogy a fenti kárigény jegyzőkönyvet megismertem, ' +
          'annak tartalmát tudomásul vettem. Elfogadom a megállapított kár összegét és a törlesztési tervet. ' +
          'Tudomásul veszem, hogy a Munka törvénykönyve 166. § és 177. § rendelkezései alapján ' +
          'a munkáltató jogosult a kártérítés összegét a munkabéremből levonni.',
          { width: pageWidth, lineGap: 2 }
        );
      doc.moveDown(1);

      // ── Section 9: Aláírások ──
      sectionTitle(doc, `${plan.length > 0 ? '9' : '8'}. ALÁÍRÁSOK`);
      doc.moveDown(0.5);

      const sigY = doc.y;
      // Left column: Employee
      doc.fontSize(9);
      doc.text('_____________________________', 60, sigY);
      doc.text('Munkavállaló aláírása', 60, sigY + 15);
      doc.text(`Dátum: ${report.employee_signature_date ? formatDate(report.employee_signature_date) : '_______________'}`, 60, sigY + 30);

      // Right column: Manager
      doc.text('_____________________________', 320, sigY);
      doc.text('Munkáltatói képviselő aláírása', 320, sigY + 15);
      doc.text(`Dátum: ${report.manager_signature_date ? formatDate(report.manager_signature_date) : '_______________'}`, 320, sigY + 30);

      doc.moveDown(3);
      // Witness
      doc.text('_____________________________', 60);
      doc.text(`Tanú neve: ${report.witness_name || '_______________'}`, 60);
      doc.text('Tanú aláírása', 60);

      // ── Section 10: Jogi hivatkozások ──
      checkNewPage(doc);
      sectionTitle(doc, 'JOGI HIVATKOZÁSOK');
      doc.fontSize(8).fillColor('#666').font('Helvetica')
        .text('• Mt. 166. § — A munkáltató köteles biztosítani az egészséges és biztonságos munkafeltételeket.')
        .text('• Mt. 177. § — A munkabérből való levonás szabályai (max. 50% a havi bérből).')
        .text('• Ptk. 6:142. § — Teljes kártérítés elve.')
        .text('• Ptk. 6:143. § — A kártérítés módja.')
        .text('• GDPR — Az adatkezelés a munkaszerződés teljesítéséhez szükséges (6. cikk (1) b) pont).');

      doc.moveDown(1);
      drawLine(doc);
      doc.fontSize(8).fillColor('#999')
        .text('Ez a dokumentum a Housing Solutions Kft. Munkaerő Stabilitási Platform által automatikusan generált.', { align: 'center' })
        .text(`Generálás időpontja: ${new Date().toISOString()}`, { align: 'center' });

      doc.end();
    } catch (err) {
      logger.error('PDF generation error:', err);
      reject(err);
    }
  });
}

// ─── Helper Functions ───────────────────────────────────────────────

function sectionTitle(doc, text) {
  doc.moveDown(0.5);
  doc.fontSize(12).fillColor('#1E40AF').font('Helvetica-Bold').text(text);
  doc.moveDown(0.3);
  doc.fillColor('#333').font('Helvetica');
}

function tableRow(doc, label, value) {
  doc.fontSize(10).font('Helvetica-Bold').text(label, { continued: true });
  doc.font('Helvetica').text(`  ${value}`);
}

function drawLine(doc) {
  doc.moveTo(60, doc.y).lineTo(535, doc.y).strokeColor('#ccc').lineWidth(0.5).stroke();
  doc.moveDown(0.3);
}

function checkNewPage(doc) {
  if (doc.y > 700) doc.addPage();
}

module.exports = { generatePDF, LIABILITY_LABELS, STATUS_LABELS };
