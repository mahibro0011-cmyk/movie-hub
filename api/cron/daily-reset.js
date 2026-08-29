const { getDb } = require('../../lib/db');
const { sendMessage } = require('../../lib/telegram');

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization || '';
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  try {
    const db = await getDb();
    const users = await db.collection('users').find({}, { projection: { telegramId: 1 } }).toArray();

    const appUrl = process.env.APP_URL;
    const text = '🔄 আপনার আজকের Earn section-এর task/ads reset হয়ে গেছে!\n\nএখনই ঢুকে আবার সব DHC Coin claim করা শুরু করুন।';
    const replyMarkup = {
      inline_keyboard: [[
        { text: '🎬 এখনই Earn করুন', web_app: { url: appUrl } }
      ]]
    };

    const results = await Promise.allSettled(
      users.map(u => sendMessage(u.telegramId, text, { reply_markup: replyMarkup }))
    );
    const sent = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;

    return res.status(200).json({ ok: true, totalUsers: users.length, sent });
  } catch (err) {
    console.error('cron/daily-reset.js error:', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
