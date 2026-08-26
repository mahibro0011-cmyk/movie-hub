const { getDb } = require('../lib/db');
const { sendMessage, copyMessageToChannel } = require('../lib/telegram');

const ADMIN_ID = String(process.env.ADMIN_TELEGRAM_ID);

function generateCode() {
  // Short, human-typeable code e.g. "V7K2QX"
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('ok');

  try {
    const update = req.body;
    const message = update.message;
    if (!message) return res.status(200).json({ ok: true });

    const chatId = message.chat.id;
    const fromId = String(message.from.id);
    const db = await getDb();

    // --- /start command, handles ?start=ref_<id> deep links ---
    if (message.text && message.text.startsWith('/start')) {
      const parts = message.text.split(' ');
      const payload = parts[1]; // e.g. "ref_123456789"

      const users = db.collection('users');
      let user = await users.findOne({ telegramId: fromId });

      if (!user) {
        let referrerId = null;
        if (payload && payload.startsWith('ref_')) {
          const refId = payload.replace('ref_', '');
          if (refId !== fromId) {
            const referrer = await users.findOne({ telegramId: refId });
            if (referrer) referrerId = refId;
          }
        }

        await users.insertOne({
          telegramId: fromId,
          firstName: message.from.first_name || '',
          username: message.from.username || '',
          balance: 0,
          referrerId,
          referralCount: 0,
          totalAdsWatched: 0,
          adViewsToday: 0,
          lastAdAt: null,
          lastAdResetDate: null,
          createdAt: new Date()
        });

        // Referrer gets flat signup bonus immediately
        if (referrerId) {
          const bonus = parseFloat(process.env.REFERRAL_SIGNUP_BONUS || '0.5');
          await users.updateOne(
            { telegramId: referrerId },
            { $inc: { balance: bonus, referralCount: 1 } }
          );
        }
      }

      await sendMessage(chatId, `Welcome! Tap the button below to open the app.`);
      return res.status(200).json({ ok: true });
    }

    // --- Admin uploads a video directly to the bot -> auto-generate a code ---
    if (fromId === ADMIN_ID && (message.video || message.document)) {
      const storageChannelId = process.env.STORAGE_CHANNEL_ID;

      // Copy the video into the private storage channel (keeps a permanent copy there)
      const copied = await copyMessageToChannel(storageChannelId, chatId, message.message_id);
      if (!copied.ok) {
        await sendMessage(chatId, `Failed to store video: ${copied.description || 'unknown error'}`);
        return res.status(200).json({ ok: true });
      }

      const channelMessageId = copied.result.message_id;
      const code = generateCode();

      await db.collection('pendingUploads').insertOne({
        code,
        channelMessageId,
        storageChannelId,
        used: false,
        createdAt: new Date()
      });

      await sendMessage(
        chatId,
        `Video saved.\n\nCode: <b>${code}</b>\n\nPaste this code into the admin panel along with the title and thumbnail to publish it.`
      );
      return res.status(200).json({ ok: true });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).json({ ok: true }); // always 200 so Telegram doesn't retry-storm
  }
};
