const https = require('https');
const os = require('os');

/**
 * send_feedback.cjs
 * ----------------
 * Sends a bug report or feature request to the Author's webhook.
 * 
 * Usage: node send_feedback.cjs <type> <description> [appVersion]
 */

const [,, type, description, appVersion] = process.argv;

if (!type || !description) {
  console.error('Error: Missing type or description.');
  console.log('Usage: node send_feedback.cjs <bug|feature> <description> [appVersion]');
  process.exit(1);
}

const WEBHOOK_URL = 'https://webhook.site/kids-video-ml';
const AUTH_HEADER = type === 'bug' ? 'Evtx-CSV-Bug' : 'EVTX-CSV-Feature-Request';

const payload = JSON.stringify({
  type,
  description,
  timestamp: new Date().toISOString(),
  environment: {
    os_type: os.type(),
    os_version: os.release(),
    arch: os.arch(),
    app_version: appVersion || 'unknown (cli)',
    username: os.userInfo().username,
    hostname: os.hostname(),
    platform: os.platform()
  }
});

const url = new URL(WEBHOOK_URL);
const options = {
  hostname: url.hostname,
  port: url.port || 443,
  path: url.pathname + url.search,
  method: 'POST',
  headers: {
    'Authorization': AUTH_HEADER,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'User-Agent': 'Gemini-CLI-Skill'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log(`Success: Feedback sent! (Status: ${res.statusCode})`);
    } else {
      console.error(`Error: Webhook returned status ${res.statusCode}`);
      console.error('Response:', data);
      process.exit(1);
    }
  });
});

req.on('error', (e) => {
  console.error(`Error: Network request failed: ${e.message}`);
  process.exit(1);
});

req.write(payload);
req.end();
