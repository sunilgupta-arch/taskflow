/**
 * One-time script: authorize Gmail send scope and print the refresh token.
 * Run: node scripts/getGmailToken.js
 *
 * Steps:
 *  1. Run this script — it starts a local server and prints an auth URL
 *  2. Open the URL in your browser, sign in as srvicea@123cfc.com
 *  3. Approve Gmail permission — you'll be redirected back automatically
 *  4. Copy the printed GMAIL_REFRESH_TOKEN into your .env file
 */

require('dotenv').config();
const { google } = require('googleapis');
const http = require('http');
const url = require('url');

const PORT = 9001;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

// Desktop (installed) clients allow any localhost port — no Cloud Console change needed
const oauth2Client = new google.auth.OAuth2(
  process.env.GDRIVE_CLIENT_ID,
  process.env.GDRIVE_CLIENT_SECRET,
  REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/gmail.send'],
  prompt: 'consent',
});

const server = http.createServer(async (req, res) => {
  const { pathname, query } = url.parse(req.url, true);
  if (pathname !== '/callback') { res.end(); return; }

  const code = query.code;
  if (!code) {
    res.end('Error: no authorization code received.');
    server.close();
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.end('<h2 style="font-family:sans-serif">Authorization successful! You can close this tab.</h2>');
    server.close();

    console.log('\n✓ Success! Add this line to your .env file:\n');
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\nThen restart the server — email will use OAuth2 automatically.');
  } catch (err) {
    res.end('Error: ' + err.message);
    server.close();
    console.error('✗ Failed:', err.message);
  }
});

server.listen(PORT, () => {
  console.log('\n── Gmail OAuth Authorization ──────────────────────────────────');
  console.log('Open this URL in your browser (sign in as srvicea@123cfc.com):\n');
  console.log(authUrl);
  console.log('\nWaiting for Google to redirect back...');
  console.log('───────────────────────────────────────────────────────────────');
});
