// Run once after every deploy (or whenever your Vercel URL changes):
//   node scripts/set-webhook.js https://your-project.vercel.app
//
// Reads BOT_TOKEN from your local .env file (uses the 'dotenv' pattern manually
// so you don't need an extra dependency for a one-off script).

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2];
  }
}

loadEnv();

const deployUrl = process.argv[2];
if (!deployUrl) {
  console.error('Usage: node scripts/set-webhook.js https://your-project.vercel.app');
  process.exit(1);
}

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('BOT_TOKEN not found. Make sure .env exists with BOT_TOKEN set.');
  process.exit(1);
}

const webhookUrl = `${deployUrl.replace(/\/$/, '')}/api/webhook`;

fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: webhookUrl })
})
  .then(r => r.json())
  .then(data => {
    console.log('Telegram response:', data);
    if (data.ok) console.log(`\nWebhook set to: ${webhookUrl}`);
  })
  .catch(err => console.error('Failed:', err));
