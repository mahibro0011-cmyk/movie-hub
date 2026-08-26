const { getDb } = require('../lib/db');
const { verifyInitData } = require('../lib/auth');
const { copyMessageToUser } = require('../lib/telegram');

const ADS_PER_POINT = parseInt(process.env.ADS_PER_POINT || '2', 10);
const POINTS_PER_AD_BATCH = parseFloat(process.env.POINTS_PER_AD_BATCH || '0.5');
const UNLOCK_COST = parseFloat(process.env.UNLOCK_COST || '1');
const AD_COOLDOWN_SECONDS = parseInt(process.env.AD_COOLDOWN_SECONDS || '20', 10);
const DAILY_AD_LIMIT = parseInt(process.env.DAILY_AD_LIMIT || '20', 10);
const REFERRAL_COMMISSION_PCT = parseFloat(process.env.REFERRAL_UNLOCK_COMMISSION_PCT || '10');

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
          dailyAdLimit: DAILY_AD_LIMIT
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

      let pointsEarned = 0;
      if (totalAdsWatched % ADS_PER_POINT === 0) {
        pointsEarned = POINTS_PER_AD_BATCH;
      }

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

      const alreadyUnlocked = await db.collection('unlockedVideos').findOne({
        userId: telegramId, videoId: String(videoId)
      });

      if (!alreadyUnlocked) {
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

    return res.status(400).json({ ok: false, error: 'unknown_action' });
  } catch (err) {
    console.error('user.js error:', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
