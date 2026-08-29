const { getDb } = require('../lib/db');
const { verifyInitData } = require('../lib/auth');
const { copyMessageToUser, sendMessage } = require('../lib/telegram');

const POINTS_PER_AD = parseFloat(process.env.POINTS_PER_AD_BATCH || '0.5');
const UNLOCK_COST = parseFloat(process.env.UNLOCK_COST || '1');
const AD_COOLDOWN_SECONDS = parseInt(process.env.AD_COOLDOWN_SECONDS || '20', 10);
const DAILY_AD_LIMIT = parseInt(process.env.DAILY_AD_LIMIT || '20', 10);
const REFERRAL_COMMISSION_PCT = parseFloat(process.env.REFERRAL_UNLOCK_COMMISSION_PCT || '10');
const MIN_WITHDRAW = parseFloat(process.env.MIN_WITHDRAW || '500');
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || '5697990319';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  try {
    const action = req.query.action;
    const db = await getDb();
    const users = db.collection('users');

    // Every request must carry valid Telegram initData - this is what
    // stops someone from spoofing another user's telegramId.
    const initData = req.method === 'GET' ? req.query.initData : req.body.initData;
    const tgUser = verifyInitData(initData);
    if (!tgUser) return res.status(401).json({ ok: false, error: 'invalid_auth' });

    const telegramId = String(tgUser.id);
    let user = await users.findOne({ telegramId });
    if (!user) {
      // Fallback creation if user opened the Mini App without ever hitting /start
      await users.insertOne({
        telegramId,
        firstName: tgUser.first_name || '',
        username: tgUser.username || '',
        balance: 0,
        referrerId: null,
        referralCount: 0,
        totalAdsWatched: 0,
        adViewsToday: 0,
        lastAdAt: null,
        lastAdResetDate: todayStr(),
        createdAt: new Date()
      });
      user = await users.findOne({ telegramId });
    }

    // ---------------- GET PROFILE ----------------
    if (action === 'profile') {
      return res.status(200).json({
        ok: true,
        user: {
          telegramId: user.telegramId,
          firstName: tgUser.first_name,
          photoUrl: tgUser.photo_url || null,
          balance: user.balance,
          referralCount: user.referralCount,
          totalAdsWatched: user.totalAdsWatched,
          adViewsToday: user.adViewsToday,
          dailyAdLimit: DAILY_AD_LIMIT,
          minWithdraw: MIN_WITHDRAW
        }
      });
    }

    // ---------------- WATCH AD ----------------
    if (action === 'watch_ad' && req.method === 'POST') {
      const today = todayStr();
      let adViewsToday = user.adViewsToday || 0;
      if (user.lastAdResetDate !== today) adViewsToday = 0;

      if (adViewsToday >= DAILY_AD_LIMIT) {
        return res.status(429).json({ ok: false, error: 'daily_limit_reached' });
      }

      if (user.lastAdAt) {
        const secsSince = (Date.now() - new Date(user.lastAdAt).getTime()) / 1000;
        if (secsSince < AD_COOLDOWN_SECONDS) {
          return res.status(429).json({
            ok: false,
            error: 'cooldown',
            waitSeconds: Math.ceil(AD_COOLDOWN_SECONDS - secsSince)
          });
        }
      }

      adViewsToday += 1;
      const totalAdsWatched = (user.totalAdsWatched || 0) + 1;

      // Every single ad rewards points now (no batching - previously only every
      // Nth ad paid out via ADS_PER_POINT).
      const pointsEarned = POINTS_PER_AD;

      await users.updateOne(
        { telegramId },
        {
          $set: { adViewsToday, lastAdAt: new Date(), lastAdResetDate: today },
          $inc: { totalAdsWatched: 1, balance: pointsEarned }
        }
      );

      const updated = await users.findOne({ telegramId });
      return res.status(200).json({
        ok: true,
        pointsEarned,
        newBalance: updated.balance,
        adViewsToday,
        dailyAdLimit: DAILY_AD_LIMIT
      });
    }

    // ---------------- UNLOCK VIDEO ----------------
    if (action === 'unlock' && req.method === 'POST') {
      const { videoId } = req.body;
      if (!videoId) return res.status(400).json({ ok: false, error: 'missing_video_id' });

      const { ObjectId } = require('mongodb');
      const videos = db.collection('videos');
      const video = await videos.findOne({ _id: new ObjectId(videoId) });
      if (!video) return res.status(404).json({ ok: false, error: 'video_not_found' });

      // Unlocking always costs UNLOCK_COST, every single time - a previous
      // unlock of this same video does NOT make a re-watch free. Every unlock
      // (first time or repeat) is its own paid transaction and its own row in
      // unlockedVideos, so "Total Video Unlocked" reflects total purchases.
      if (user.balance < UNLOCK_COST) {
        return res.status(402).json({ ok: false, error: 'insufficient_balance', required: UNLOCK_COST, balance: user.balance });
      }

      await users.updateOne({ telegramId }, { $inc: { balance: -UNLOCK_COST } });

      await db.collection('unlockedVideos').insertOne({
        userId: telegramId,
        videoId: String(videoId),
        unlockedAt: new Date()
      });

      await videos.updateOne({ _id: video._id }, { $inc: { unlockCount: 1 } });

      // Referrer commission
      if (user.referrerId) {
        const commission = UNLOCK_COST * (REFERRAL_COMMISSION_PCT / 100);
        await users.updateOne({ telegramId: user.referrerId }, { $inc: { balance: commission } });
      }

      // Deliver the video into the user's DM by copying directly from the admin's
      // original private message to the bot — no channel involved.
      const delivery = await copyMessageToUser(telegramId, video.sourceChatId, video.sourceMessageId);
      if (!delivery.ok) {
        return res.status(500).json({ ok: false, error: 'delivery_failed', detail: delivery.description });
      }

      const updated = await users.findOne({ telegramId });
      return res.status(200).json({ ok: true, newBalance: updated.balance, delivered: true });
    }

    // ---------------- UNLOCKED HISTORY (for profile "Total Video Unlocked") ----------------
    if (action === 'unlocked_history') {
      const entries = await db.collection('unlockedVideos')
        .find({ userId: telegramId }).sort({ unlockedAt: -1 }).toArray();

      const videoIds = entries.map(e => {
        const { ObjectId } = require('mongodb');
        return new ObjectId(e.videoId);
      });
      const videos = await db.collection('videos').find({ _id: { $in: videoIds } }).toArray();
      const videoMap = Object.fromEntries(videos.map(v => [String(v._id), v]));

      return res.status(200).json({
        ok: true,
        count: entries.length,
        videos: entries.map(e => ({
          title: videoMap[e.videoId]?.title || 'Unknown',
          thumbnail: videoMap[e.videoId]?.thumbnail || null,
          unlockedAt: e.unlockedAt
        }))
      });
    }

    // ---------------- WITHDRAW: submit a request ----------------
    if (action === 'withdraw_request' && req.method === 'POST') {
      const { amount, method, accountNumber } = req.body;
      const amt = parseFloat(amount);

      if (!amt || !['bkash', 'nagad'].includes(method) || !accountNumber || !String(accountNumber).trim()) {
        return res.status(400).json({ ok: false, error: 'missing_fields' });
      }
      if (amt < MIN_WITHDRAW) {
        return res.status(400).json({ ok: false, error: 'below_minimum', minimum: MIN_WITHDRAW });
      }
      if (user.balance < amt) {
        return res.status(402).json({ ok: false, error: 'insufficient_balance', balance: user.balance });
      }

      // Hold the balance immediately so it can't be double-spent while the
      // request is pending - admin/manage.js refunds it automatically on reject.
      await users.updateOne({ telegramId }, { $inc: { balance: -amt } });

      const result = await db.collection('withdrawals').insertOne({
        userId: telegramId,
        amount: amt,
        method,
        accountNumber: String(accountNumber).trim(),
        status: 'pending',
        createdAt: new Date()
      });

      // Best-effort notify the admin - a failed notify should never fail the request itself.
      try {
        await sendMessage(
          ADMIN_TELEGRAM_ID,
          `💸 Notun withdraw request!\n\nUser: ${user.firstName || ''} (${telegramId})\nAmount: ${amt} DHC\nMethod: ${method}\nAccount: ${accountNumber}\n\nAdmin panel-er Withdrawals tab theke approve/reject korun.`
        );
      } catch (err) {
        console.error('withdraw admin notify failed:', err.message);
      }

      const updated = await users.findOne({ telegramId });
      return res.status(200).json({ ok: true, withdrawalId: result.insertedId, newBalance: updated.balance });
    }

    // ---------------- WITHDRAW: this user's own history ----------------
    if (action === 'withdraw_history') {
      const withdrawals = await db.collection('withdrawals')
        .find({ userId: telegramId }).sort({ createdAt: -1 }).toArray();

      return res.status(200).json({
        ok: true,
        withdrawals: withdrawals.map(w => ({
          id: w._id,
          amount: w.amount,
          method: w.method,
          status: w.status,
          createdAt: w.createdAt
        }))
      });
    }

    return res.status(400).json({ ok: false, error: 'unknown_action' });
  } catch (err) {
    console.error('user.js error:', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
