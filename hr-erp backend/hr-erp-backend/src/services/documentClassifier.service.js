const { logger } = require('../utils/logger');

// Document type classification patterns
const CLASSIFICATION_RULES = [
  {
    type: 'invoice',
    keywords: [
      'számla', 'szamla', 'invoice', 'faktura',
      'számlaszám', 'szamlaszam', 'invoice number',
      'nettó', 'netto', 'bruttó', 'brutto', 'áfa', 'afa', 'vat',
      'fizetési határidő', 'fizetesi hatarido', 'due date',
      'adószám', 'adoszam', 'tax number',
    ],
    weight: 10,
    requiredMin: 2, // need at least 2 keyword matches
  },
  {
    type: 'damage_report',
    keywords: [
      'kárbejelentés', 'karbejelentes', 'damage report', 'damage',
      'hibajegy', 'hibabejelentés', 'hibabejelentes',
      'meghibásodás', 'meghibasodas', 'elromlott',
      'sérülés', 'serules', 'törés', 'tores',
      'beázás', 'beazas', 'csőtörés', 'csotores',
      'nem működik', 'nem mukodik', 'elromlott',
      'karbantartás', 'karbantartas', 'javítás', 'javitas',
      'szoba', 'room', 'lakás', 'lakas',
    ],
    weight: 8,
    requiredMin: 2,
  },
  {
    type: 'employee_contract',
    keywords: [
      'munkaszerződés', 'munkaszerzodes', 'employment contract',
      'munkavállaló', 'munkavallalo', 'employee',
      'munkáltató', 'munkaltato', 'employer',
      'munkaviszony', 'próbaidő', 'probaidő',
      'munkabér', 'munkaber', 'alapbér', 'alapber',
      'munkakör', 'munkakor', 'beosztás', 'beosztas',
    ],
    weight: 9,
    requiredMin: 2,
  },
  {
    type: 'service_contract',
    keywords: [
      'szolgáltatási szerződés', 'szolgaltatasi szerzodes',
      'service agreement', 'service contract',
      'vállalkozási szerződés', 'vallalkozasi szerzodes',
      'megbízási szerződés', 'megbizasi szerzodes',
      'szerződő felek', 'szerzodo felek',
      'szolgáltatás tárgya', 'szolgaltatas targya',
      'díjazás', 'dijazas', 'ellenszolgáltatás',
    ],
    weight: 7,
    requiredMin: 2,
  },
  {
    type: 'rental_contract',
    keywords: [
      'bérleti szerződés', 'berleti szerzodes',
      'rental contract', 'lease agreement',
      'bérbeadó', 'berbeado', 'landlord',
      'bérlő', 'berlo', 'tenant',
      'bérleti díj', 'berleti dij', 'rent',
      'albérlet', 'alberlet', 'lakásbérleti', 'lakasb',
      'ingatlan', 'helyiség', 'helyiseg',
    ],
    weight: 7,
    requiredMin: 2,
  },
  {
    type: 'tax_document',
    keywords: [
      'áfa bevallás', 'afa bevallas', 'tax return',
      'adóbevallás', 'adobevallas',
      'nav', 'adóhatóság', 'adohatosag',
      'társasági adó', 'tarsasagi ado',
      'iparűzési adó', 'iparuzesi ado',
      'adóelőleg', 'adoeloleg',
      'bevallás', 'bevallas',
    ],
    weight: 6,
    requiredMin: 2,
  },
  {
    type: 'payment_reminder',
    keywords: [
      'fizetési felszólítás', 'fizetesi felszolitas',
      'fizetési emlékeztető', 'fizetesi emlekezteto',
      'payment reminder', 'overdue',
      'késedelmi kamat', 'kesedelmi kamat',
      'tartozás', 'tartozas',
      'lejárt', 'lejart', 'hátralék', 'hatral',
      'felszólítás', 'felszolitas',
    ],
    weight: 8,
    requiredMin: 2,
  },
];

class DocumentClassifierService {

  /**
   * Classify a document based on extracted text and filename
   * @returns {{ documentType, confidence, reasoning, entities }}
   */
  classifyDocument(text, filename = '') {
    const searchText = (text + ' ' + filename).toLowerCase();
    const scores = [];

    for (const rule of CLASSIFICATION_RULES) {
      const matchedKeywords = [];
      for (const keyword of rule.keywords) {
        if (searchText.includes(keyword.toLowerCase())) {
          matchedKeywords.push(keyword);
        }
      }

      if (matchedKeywords.length >= rule.requiredMin) {
        const confidence = Math.min(95, 30 + (matchedKeywords.length * rule.weight));
        scores.push({
          type: rule.type,
          confidence,
          matchedKeywords,
          matchCount: matchedKeywords.length,
        });
      }
    }

    // Sort by confidence DESC
    scores.sort((a, b) => b.confidence - a.confidence);

    if (scores.length === 0) {
      return {
        documentType: 'other',
        confidence: 20,
        reasoning: 'Nem sikerült automatikusan besorolni a dokumentumot',
        matchedKeywords: [],
      };
    }

    const best = scores[0];
    const reasoning = `${this.getTypeName(best.type)}: ${best.matchCount} kulcsszó egyezés (${best.matchedKeywords.slice(0, 5).join(', ')})`;

    logger.info(`Document classified as ${best.type} (${best.confidence}%): ${reasoning}`);

    return {
      documentType: best.type,
      confidence: best.confidence,
      reasoning,
      matchedKeywords: best.matchedKeywords,
      allScores: scores.slice(0, 3), // top 3 for reference
    };
  }

  /**
   * Get human-readable name for document type
   */
  getTypeName(type) {
    const names = {
      invoice: 'Számla',
      damage_report: 'Kárbejelentés',
      employee_contract: 'Munkaszerződés',
      service_contract: 'Szolgáltatási szerződés',
      rental_contract: 'Bérleti szerződés',
      tax_document: 'Adó dokumentum',
      payment_reminder: 'Fizetési felszólítás',
      other: 'Egyéb',
    };
    return names[type] || type;
  }
}

module.exports = new DocumentClassifierService();
