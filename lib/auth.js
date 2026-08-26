const crypto = require('crypto');

// Verifies the initData string sent by the Telegram Mini App frontend.
// This is CRITICAL - without this, anyone could POST a fake telegramId
// and drain/credit any account. Never trust a telegramId sent without this check.
function verifyInitData(initData) {
  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');

  const dataCheckArr = [];
  for (const [key, value] of [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    dataCheckArr.push(`${key}=${value}`);
  }
  const dataCheckString = dataCheckArr.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) {
    return null; // invalid / tampered
  }

  // Optional: reject stale initData older than 24h
  const authDate = parseInt(params.get('auth_date'), 10);
  if (Date.now() / 1000 - authDate > 86400) {
    return null;
  }

  const userJson = params.get('user');
  if (!userJson) return null;

  return JSON.parse(userJson); // { id, first_name, last_name, username, photo_url }
}

// Verifies initData AND confirms the Telegram user is the configured admin.
// This replaces the old secret-password check — only the Telegram account
// whose numeric ID matches ADMIN_TELEGRAM_ID can pass this.
function verifyAdmin(initData) {
  const tgUser = verifyInitData(initData);
  if (!tgUser) return null;
  if (String(tgUser.id) !== String(process.env.ADMIN_TELEGRAM_ID)) return null;
  return tgUser;
}

module.exports = { verifyInitData, verifyAdmin };
