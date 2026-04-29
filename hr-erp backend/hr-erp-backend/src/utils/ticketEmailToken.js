/**
 * Ticket reply-routing tokens.
 *
 * Outbound emails generated from a ticket-chat message carry a token in
 * the subject so any reply can be matched back to the source ticket
 * without depending on Gmail threading headers (which clients drop).
 *
 *   Format: [#TICKET-{ticket_number}]
 *   Examples:
 *     buildSubject('Csöpög a csap', '#15') →
 *       'Re: [#TICKET-15] Csöpög a csap'
 *     parseToken('Re: Re: [#TICKET-15] Csöpög a csap') → '#15'
 *
 * The number portion uses tickets.ticket_number (a globally-unique
 * integer counter, NOT the UUID) so the subject stays short and human.
 *
 * Quote-stripping helper for inbound replies is in this file too — it's
 * purely a regex/heuristic walker, no library dep.
 */

const TOKEN_RE = /\[#TICKET-(\d+)\]/i;

function parseToken(subject) {
  if (!subject) return null;
  const m = String(subject).match(TOKEN_RE);
  if (!m) return null;
  // Return the same shape tickets.ticket_number stores ('#15')
  return `#${m[1]}`;
}

function hasToken(subject) {
  return !!parseToken(subject);
}

/**
 * Build a "Re: [#TICKET-N] {title}" subject for outbound mail.
 * Caller passes ticket.ticket_number (e.g. '#15' or '15' — both work).
 */
function buildSubject(title, ticketNumber) {
  const num = String(ticketNumber || '').replace(/^#/, '');
  const cleanTitle = (title || '').slice(0, 200);
  return `[#TICKET-${num}] ${cleanTitle}`.trim();
}

/**
 * Strip quoted history from an inbound reply body. We want only the
 * NEW content the user typed at the top, not the full conversation.
 *
 * Heuristics, in order:
 *   1. Cut at the first "On <date>, <name> wrote:" line (en/hu/de).
 *   2. Cut at the first standalone "----- Original Message -----".
 *   3. Drop trailing run of '>' quoted lines.
 *
 * Imperfect — Gmail/Outlook/Apple Mail all use slightly different
 * markers — but covers the 90% case without pulling email-reply-parser.
 */
function stripQuotedReply(text) {
  if (!text) return '';
  let body = String(text).replace(/\r\n/g, '\n');

  // Pattern 1: "On Mon, Apr 29, 2026 at 10:00, Jane Doe <j@x> wrote:"
  // Hungarian: "{date}, {name} ezt írta:"
  // German:    "Am {date} schrieb {name}:"
  const wroteMarkers = [
    /^On .+ wrote:\s*$/im,
    /^.+ ezt írta:\s*$/im,
    /^Am .+ schrieb .+:\s*$/im,
    /^-{3,}\s*Original Message\s*-{3,}\s*$/im,
    /^-{3,}\s*Eredeti üzenet\s*-{3,}\s*$/im,
    /^>?\s*From:\s.+\nSent:\s.+/im,   // Outlook block
  ];
  for (const re of wroteMarkers) {
    const m = body.match(re);
    if (m && typeof m.index === 'number') {
      body = body.slice(0, m.index);
      break;
    }
  }

  // Drop trailing '>' quoted block
  const lines = body.split('\n');
  while (lines.length > 0 && /^\s*>/.test(lines[lines.length - 1])) lines.pop();
  // Drop trailing empties
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

  return lines.join('\n').trim();
}

/**
 * Lightweight loop / auto-reply detector. Returns a {drop, reason}
 * verdict from the inbound headers + From address. Mirrors the SMTP
 * conventions for "this is automation, don't reply to it":
 *   - Auto-Submitted ≠ 'no' (RFC 3834)
 *   - Precedence: bulk | list | junk
 *   - X-Auto-Response-Suppress / X-Autoreply / X-Autorespond present
 *   - From: matches our own SMTP_FROM (self-loop)
 *
 * Headers can be a Map, an object, or the Gmail [{name,value}] array;
 * we accept all three for convenience.
 */
function detectAutoReply(headers, fromAddress, ourFrom) {
  const get = (h) => {
    if (!headers) return null;
    if (Array.isArray(headers)) {
      const f = headers.find(x => String(x.name).toLowerCase() === h.toLowerCase());
      return f?.value || null;
    }
    if (typeof headers.get === 'function') return headers.get(h);
    // plain object
    const key = Object.keys(headers).find(k => k.toLowerCase() === h.toLowerCase());
    return key ? headers[key] : null;
  };

  const autoSubmitted = (get('Auto-Submitted') || '').toLowerCase().trim();
  if (autoSubmitted && autoSubmitted !== 'no') return { drop: true, reason: `Auto-Submitted: ${autoSubmitted}` };

  const precedence = (get('Precedence') || '').toLowerCase().trim();
  if (['bulk', 'list', 'junk'].includes(precedence)) return { drop: true, reason: `Precedence: ${precedence}` };

  if (get('X-Auto-Response-Suppress')) return { drop: true, reason: 'X-Auto-Response-Suppress present' };
  if (get('X-Autoreply'))              return { drop: true, reason: 'X-Autoreply present' };
  if (get('X-Autorespond'))            return { drop: true, reason: 'X-Autorespond present' };

  if (fromAddress && ourFrom && fromAddress.toLowerCase() === ourFrom.toLowerCase()) {
    return { drop: true, reason: 'Self-loop (From == our SMTP_FROM)' };
  }

  return { drop: false };
}

module.exports = {
  TOKEN_RE,
  parseToken,
  hasToken,
  buildSubject,
  stripQuotedReply,
  detectAutoReply,
};
