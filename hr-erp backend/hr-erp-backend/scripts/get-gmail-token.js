#!/usr/bin/env node
/**
 * One-shot Gmail OAuth refresh-token minter.
 *
 * Use this when the existing GMAIL_REFRESH_TOKEN gets invalidated
 * (Google revokes them on password change, 6-month inactivity,
 * or manual revocation in account.security). Symptoms:
 *   "Gmail universal poll error: invalid_grant — Token has been
 *    expired or revoked." (every 5 min in logs)
 *
 * Usage:
 *   1. Make sure your .env has GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET,
 *      GMAIL_REDIRECT_URI (must be 'http://localhost' for this script).
 *   2. From hr-erp-backend/, run:  node scripts/get-gmail-token.js
 *   3. Browser opens to Google's consent screen.
 *      Sign in as housingsolutionsszamlazas@gmail.com (or whichever
 *      Gmail account is being polled).
 *   4. After consent, browser redirects to http://localhost/?code=...
 *      This script's tiny HTTP server catches that, exchanges the
 *      code for tokens, prints the refresh_token, and exits.
 *   5. Copy the printed line into .env (replace GMAIL_REFRESH_TOKEN)
 *      and restart the backend.
 *
 * Why a custom script and not OAuth Playground:
 *   GMAIL_REDIRECT_URI is set to 'http://localhost' in .env, which
 *   is also what's registered in the Google Cloud Console for this
 *   OAuth client. Playground would require adding its own redirect
 *   URI to the GCP client config. This script works with the
 *   existing setup, no GCP changes needed.
 */
require('dotenv').config();
const http = require('http');
const url = require('url');
const { google } = require('googleapis');

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || 'http://localhost';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env');
  process.exit(1);
}

// We need to bind a port to catch the redirect. Try the URL's port,
// fall back to a fresh ephemeral one if the URI is just /localhost.
const parsed = new URL(REDIRECT_URI);
const PORT = parseInt(parsed.port, 10) || 80;

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
];

const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',   // crucial — without this no refresh_token
  prompt: 'consent',         // force fresh refresh_token even if cached
  scope: SCOPES,
});

console.log('\n=== Gmail OAuth refresh-token minter ===\n');
console.log('1. Open this URL in your browser (you may need to sign in as the polled account):\n');
console.log('   ' + authUrl + '\n');
console.log('2. After granting consent, the browser will redirect to:');
console.log('   ' + REDIRECT_URI + '/?code=...');
console.log('   This script will catch that redirect and exchange the code.\n');
console.log(`Listening on port ${PORT}...`);
if (PORT === 80) console.log('(if port 80 is taken, edit GMAIL_REDIRECT_URI to use a free port like http://localhost:8080 in BOTH .env AND Google Cloud Console)');

const server = http.createServer(async (req, res) => {
  try {
    const q = url.parse(req.url, true).query;
    if (q.error) {
      res.end(`OAuth error: ${q.error}`);
      console.error('\n❌ OAuth error:', q.error);
      process.exit(1);
    }
    if (!q.code) {
      res.end('Waiting for code…');
      return;
    }
    res.end('<html><body style="font-family:sans-serif"><h2>✅ Token received — you can close this tab.</h2></body></html>');

    const { tokens } = await oauth2.getToken(q.code);
    console.log('\n=== Tokens received ===');
    if (!tokens.refresh_token) {
      console.warn('⚠️  No refresh_token in response. This usually means Google already issued one for this client+account combination. Revoke access at https://myaccount.google.com/permissions and re-run, OR add prompt=consent (already set in this script).');
    } else {
      console.log('\nCopy this line into .env (replace the old GMAIL_REFRESH_TOKEN value):\n');
      console.log('GMAIL_REFRESH_TOKEN=' + tokens.refresh_token);
      console.log('\nThen restart the backend.');
    }
    if (tokens.access_token) {
      console.log('\n(also got an access_token, expires in', tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : 'unknown', '— not needed for .env, refresh_token is all you store)');
    }
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Token exchange failed:', err.message);
    res.end('Error: ' + err.message);
    process.exit(1);
  }
});

server.on('error', (err) => {
  if (err.code === 'EACCES' && PORT === 80) {
    console.error('\n❌ Port 80 needs root. Either:');
    console.error('   sudo node scripts/get-gmail-token.js');
    console.error('   OR edit GMAIL_REDIRECT_URI in .env to http://localhost:8080 (and add that URL to the OAuth client in Google Cloud Console).');
  } else if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is in use. Free it or change GMAIL_REDIRECT_URI.`);
  } else {
    console.error('\n❌ Server error:', err.message);
  }
  process.exit(1);
});

server.listen(PORT);
