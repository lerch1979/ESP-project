const BASE = 'http://localhost:3000/api/v1';
const { Pool } = require('pg');

async function test() {
  const pool = new Pool({ host: 'localhost', port: 5432, database: 'hr_erp_db', user: 'postgres', password: 'Jelszo123' });

  // 1. Login
  console.log('STEP 1: Login');
  let res = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'horvath.gabor@employee.com', password: 'password123' })
  });
  const login = await res.json();
  const token = login.data?.token;
  if (!token) { console.log('  FAIL:', JSON.stringify(login)); return; }
  console.log('  OK');
  const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };

  // 2. Insert a test KB entry with priority=0, unique terms (no keyword overlap with existing entries)
  console.log('\nSTEP 2: Insert test KB entry with priority=0');
  const contractorId = '1bad6c67-0350-4dd2-82b2-d96caf9e4f2a';
  const insertRes = await pool.query(
    `INSERT INTO chatbot_knowledge_base (contractor_id, question, answer, keywords, priority, is_active)
     VALUES ($1, 'Mennyi a fizetesem netto osszege?', 'A netto fizetesed a berszamfejtesi lapon talalhato. Kerdessel fordulj a HR osztaly fele.', ARRAY['fizetes','netto','ber','fizetesi'], 0, true)
     RETURNING id`,
    [contractorId]
  );
  const testKbId = insertRes.rows[0].id;
  console.log('  Inserted test KB id:', testKbId);

  // Update the search_vector for the new entry
  await pool.query(
    `UPDATE chatbot_knowledge_base
     SET search_vector = setweight(to_tsvector('simple', COALESCE(question, '')), 'A') ||
                         setweight(to_tsvector('simple', COALESCE(array_to_string(keywords, ' '), '')), 'A') ||
                         setweight(to_tsvector('simple', COALESCE(answer, '')), 'B')
     WHERE id = $1`,
    [testKbId]
  );
  console.log('  Updated search_vector');

  // Verify: a misspelled version "fizetesm netto" should:
  //   - trgm match "Mennyi a fizetesem netto osszege?" at ~0.25 (> 0.2)
  //   - but with priority=0, combined = fts + trgm + 0 might be < 0.3
  const ACCENT_MAP = {
    'á':'a','é':'e','í':'i','ó':'o','ö':'o','ő':'o','ú':'u','ü':'u','ű':'u',
    'Á':'a','É':'e','Í':'i','Ó':'o','Ö':'o','Ő':'o','Ú':'u','Ü':'u','Ű':'u'
  };
  function normalizeText(text) {
    return text.toLowerCase()
      .replace(/[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/g, ch => ACCENT_MAP[ch] || ch)
      .replace(/[^a-z0-9\s]/g, '').trim();
  }
  function extractWords(text) {
    return normalizeText(text).split(/\s+/).filter(w => w.length > 1);
  }

  // Test scoring for various queries
  console.log('\nSTEP 3: Test trigram scoring for candidate queries');
  const candidates = [
    'fizetes mennyi',
    'fizetesem osszeg',
    'netto ber kerdes',
    'mennyi netto fizetes',
    'a fizetesem mennyi',
    'netto osszeg',
  ];

  for (const q of candidates) {
    const words = extractWords(q);
    const tsqueryTerms = words.map(w => `${w}:*`).join(' | ');
    const normalized = normalizeText(q);

    const kb = await pool.query(
      `SELECT question,
              ts_rank(search_vector, to_tsquery('simple', $2)) * 2 AS fts_score,
              similarity(LOWER(question), $3) AS trgm_score,
              COALESCE(priority, 0) * 0.1 AS prio_boost,
              (ts_rank(search_vector, to_tsquery('simple', $2)) * 2 + similarity(LOWER(question), $3) + COALESCE(priority, 0) * 0.1) AS combined
       FROM chatbot_knowledge_base
       WHERE contractor_id = $1 AND is_active = true
         AND (search_vector @@ to_tsquery('simple', $2) OR similarity(LOWER(question), $3) > 0.15)
       ORDER BY combined DESC LIMIT 1`,
      [contractorId, tsqueryTerms, normalized]
    );
    const sugg = await pool.query(
      `SELECT question, similarity(LOWER(question), $2) AS score
       FROM chatbot_knowledge_base
       WHERE contractor_id = $1 AND is_active = true AND similarity(LOWER(question), $2) > 0.2
       ORDER BY score DESC LIMIT 3`,
      [contractorId, normalized]
    );

    const r = kb.rows[0];
    const kbMatch = r && r.combined >= 0.3;
    const hasSugg = sugg.rows.length > 0;
    const result = kbMatch ? 'KB_MATCH' : (hasSugg ? '>>> SUGGESTIONS' : 'FALLBACK');
    console.log(`  "${q}" -> ${result} (fts=${r ? (+r.fts_score).toFixed(3) : 'N/A'} trgm=${r ? (+r.trgm_score).toFixed(3) : 'N/A'} prio=${r ? (+r.prio_boost).toFixed(1) : 'N/A'} combined=${r ? (+r.combined).toFixed(3) : 'N/A'}) sugg_count=${sugg.rows.length}`);
    if (hasSugg && !kbMatch) {
      sugg.rows.forEach(s => console.log(`    suggestion: "${s.question}" (${(+s.score).toFixed(3)})`));
    }
  }

  // 4. Create conversation
  console.log('\nSTEP 4: Create conversation');
  res = await fetch(BASE + '/chatbot/conversations', { method: 'POST', headers });
  const conv = await res.json();
  const convId = conv.data?.id;
  console.log('  conversationId:', convId);

  // 5. Try candidates via API
  let foundSuggestions = false;
  for (const q of candidates) {
    console.log(`\nSTEP 5: Send "${q}"`);
    res = await fetch(BASE + '/chatbot/conversations/' + convId + '/messages', {
      method: 'POST', headers,
      body: JSON.stringify({ content: q })
    });
    const msg = await res.json();
    const botMsg = msg.data?.botMessage;
    const meta = typeof botMsg?.metadata === 'string' ? JSON.parse(botMsg.metadata) : botMsg?.metadata;
    console.log(`  type: ${botMsg?.message_type}, source: ${meta?.source}`);
    console.log(`  content: "${botMsg?.content?.substring(0, 80)}"`);

    if (botMsg?.message_type === 'suggestions') {
      console.log('  SUGGESTIONS:');
      meta.suggestions.forEach(s => console.log(`    - "${s.question}" (score: ${s.score})`));
      foundSuggestions = true;

      // 6. Select the first suggestion
      const suggestion = meta.suggestions[0];
      console.log(`\nSTEP 6: Select suggestion "${suggestion.question}"`);
      res = await fetch(BASE + '/chatbot/conversations/' + convId + '/suggestions', {
        method: 'POST', headers,
        body: JSON.stringify({ kb_id: suggestion.kb_id })
      });
      const sel = await res.json();
      console.log(`  success: ${sel.success}`);
      console.log(`  userMessage: [${sel.data?.userMessage?.sender_type}] "${sel.data?.userMessage?.content}"`);
      console.log(`  botMessage: [${sel.data?.botMessage?.sender_type}] [${sel.data?.botMessage?.message_type}] "${sel.data?.botMessage?.content}"`);
      break;
    }
  }

  if (!foundSuggestions) {
    console.log('\n  Suggestions not triggered via API. Testing selectSuggestion endpoint directly...');
    console.log(`\nSTEP 6: Direct selectSuggestion call with kb_id=${testKbId}`);
    res = await fetch(BASE + '/chatbot/conversations/' + convId + '/suggestions', {
      method: 'POST', headers,
      body: JSON.stringify({ kb_id: testKbId })
    });
    const sel = await res.json();
    console.log(`  success: ${sel.success}`);
    console.log(`  userMessage: [${sel.data?.userMessage?.sender_type}] "${sel.data?.userMessage?.content}"`);
    console.log(`  botMessage: [${sel.data?.botMessage?.sender_type}] [${sel.data?.botMessage?.message_type}] "${sel.data?.botMessage?.content}"`);
  }

  // 7. Verify all messages
  console.log('\nSTEP 7: All conversation messages');
  res = await fetch(BASE + '/chatbot/conversations/' + convId + '/messages', { headers });
  const msgs = await res.json();
  if (msgs.data) {
    msgs.data.forEach((m, i) => {
      const mt = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : m.metadata;
      console.log(`  ${i}: [${m.sender_type}] [${m.message_type}] (${mt?.source || '-'}) "${m.content?.substring(0, 80)}"`);
    });
  }

  // 8. Cleanup
  console.log('\nSTEP 8: Cleanup test KB entry');
  await pool.query('DELETE FROM chatbot_knowledge_base WHERE id = $1', [testKbId]);
  console.log('  Deleted test entry');
  await pool.end();

  console.log('\n=== ALL TESTS COMPLETE ===');
}

test().catch(e => console.error('ERROR:', e));
