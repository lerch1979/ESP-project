#!/usr/bin/env node
/**
 * Gmail OAuth2 setup helper — one-time refresh-token acquisition.
 *
 * Usage (from repo root):
 *   cd "hr-erp backend/hr-erp-backend"
 *   node ../../scripts/gmail-oauth-setup.js
 *
 * (Run inside the backend directory so `require('googleapis')` resolves.)
 *
 * What it does:
 *   1. Reads OAuth client credentials from ../scripts/gmail-credentials.json
 *      (relative to repo root — gitignored).
 *   2. Spins up a throwaway HTTP server on http://localhost:3033
 *      to catch the OAuth redirect.
 *   3. Opens the Google consent page in the browser, pre-filled for
 *      housingsolutionsszamlazas@gmail.com, requesting gmail.readonly +
 *      gmail.modify scopes and forcing a refresh_token with
 *      access_type=offline + prompt=consent.
 *   4. Captures the authorization code from the redirect, exchanges it
 *      for tokens, and prints the refresh_token.
 *
 * The refresh_token is printed ONCE and is NOT written to disk. Paste it
 * into backend/.env → GMAIL_REFRESH_TOKEN and restart the backend.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const { exec } = require('child_process');

// Resolve googleapis from backend/node_modules — the script lives in scripts/
// which has no node_modules of its own. Falls back to normal resolution if the
// user passes NODE_PATH or happens to have googleapis elsewhere.
const BACKEND_NODE_MODULES = path.resolve(
  __dirname, '..', 'hr-erp backend', 'hr-erp-backend', 'node_modules'
);
let google;
try {
  google = require(path.join(BACKEND_NODE_MODULES, 'googleapis')).google;
} catch {
  google = require('googleapis').google;
}

const PORT = 3033;
const TIMEOUT_MS = parseInt(process.env.OAUTH_TIMEOUT_MS || '900000', 10); // 15 min default
const REDIRECT_URI = `http://localhost:${PORT}`;
const TARGET_EMAIL = 'housingsolutionsszamlazas@gmail.com';
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];

const CREDENTIALS_PATH = path.resolve(
  __dirname,
  '..',
  'scripts',
  'gmail-credentials.json'
);

function loadCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`❌ Nem található: ${CREDENTIALS_PATH}`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  // Google Desktop OAuth credentials JSON wraps under "installed" or "web"
  const creds = raw.installed || raw.web || raw;
  if (!creds.client_id || !creds.client_secret) {
    console.error('❌ A credentials.json nem tartalmaz client_id/client_secret mezőt.');
    process.exit(1);
  }
  return { client_id: creds.client_id, client_secret: creds.client_secret };
}

function openUrl(u) {
  const cmd =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} "${u}"`, () => {}); // best-effort; no-op on failure
}

async function run() {
  const { client_id, client_secret } = loadCredentials();
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',        // required — gives us a refresh_token
    prompt: 'consent',             // force refresh_token even on re-auth
    scope: SCOPES,
    login_hint: TARGET_EMAIL,
  });

  console.log('\n================================================================');
  console.log('  Gmail OAuth — refresh token megszerzése');
  console.log('================================================================');
  console.log(`  Fiók: ${TARGET_EMAIL}`);
  console.log(`  Scopes: gmail.readonly, gmail.modify`);
  console.log(`  Callback: ${REDIRECT_URI}`);
  console.log('----------------------------------------------------------------\n');
  console.log('Nyisd meg ezt a linket a böngészőben (automatikusan próbálom):');
  console.log('\n' + authUrl + '\n');
  console.log('Ha nem nyílt meg: másold a fenti URL-t a böngésződbe.');
  console.log('Jelentkezz be mint', TARGET_EMAIL, 'és engedélyezd a hozzáférést.');
  console.log('\nVárom a Google visszairányítást...\n');

  openUrl(authUrl);

  await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const q = url.parse(req.url, true).query;

        if (q.error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h1>❌ Authorization denied</h1><p>${q.error}: ${q.error_description || ''}</p>`);
          server.close();
          reject(new Error(`OAuth error: ${q.error}`));
          return;
        }

        if (!q.code) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('Waiting for OAuth callback...');
          return;
        }

        const { tokens } = await oauth2Client.getToken(q.code);

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!doctype html><meta charset="utf-8">
          <body style="font-family: system-ui, sans-serif; max-width: 560px; margin: 80px auto; padding: 24px; background: #f6f8fa; color: #1f2328;">
            <h1 style="color: #1a7f37;">✅ Sikeres autorizáció</h1>
            <p>A refresh token megjelent a terminálban. Ezt az ablakot most be lehet zárni.</p>
            <p style="color: #57606a; font-size: 14px;">Fiók: <code>${TARGET_EMAIL}</code></p>
          </body>
        `);

        server.close();

        if (!tokens.refresh_token) {
          console.error('\n⚠️  NEM kaptunk refresh_token-t!');
          console.error('   Lehet hogy ez a fiók már korábban konszentált — indítsd újra');
          console.error('   a scriptet, vagy revokáld a konszentet: https://myaccount.google.com/permissions');
          reject(new Error('No refresh_token returned'));
          return;
        }

        console.log('================================================================');
        console.log('  ✅ REFRESH TOKEN MEGSZEREZVE');
        console.log('================================================================\n');
        console.log('  Másold ezt az .env-be (backend/.env), majd NYOMJ ENTER-T.');
        console.log('  Utána restart: ./stop-all.sh && ./start-all.sh\n');
        console.log('----------------------------------------------------------------');
        console.log('GMAIL_REFRESH_TOKEN=' + tokens.refresh_token);
        console.log('----------------------------------------------------------------\n');
        console.log('  Access token (1 óra lejáratú — csak info):');
        console.log('  ' + (tokens.access_token ? tokens.access_token.slice(0, 20) + '…' : '(nincs)') + '\n');
        console.log('  Scopes:', tokens.scope);
        console.log('  Expiry:', new Date(tokens.expiry_date).toISOString());
        console.log('\n================================================================\n');

        resolve();
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error: ' + err.message);
        server.close();
        reject(err);
      }
    });

    server.listen(PORT, () => {
      // ready
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ A :${PORT} port foglalt. Zárd be a korábbi futást.`);
      }
      reject(err);
    });

    // Configurable timeout (default 15 min, override with OAUTH_TIMEOUT_MS)
    setTimeout(() => {
      server.close();
      reject(new Error(`Timeout — nincs callback ${Math.round(TIMEOUT_MS / 60000)} percen belül.`));
    }, TIMEOUT_MS);
  });
}

run().catch((err) => {
  console.error('\n❌', err.message, '\n');
  process.exit(1);
});
