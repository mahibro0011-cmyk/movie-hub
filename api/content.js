const { getDb } = require('../lib/db');
const { verifyInitData } = require('../lib/auth');
const { isChannelMember } = require('../lib/telegram');

module.exports = async (req, res) => {
  try {
    const type = req.query.type;
    const db = await getDb();

    const initData = req.method === 'GET' ? req.query.initData : req.body.initData;
    const tgUser = verifyInitData(initData);
    if (!tgUser) return res.status(401).json({ ok: false, error: 'invalid_auth' });
    const telegramId = String(tgUser.id);

    // ---------------- VIDEOS LIST (Watch tab) ----------------
    if (type === 'videos' && req.method === 'GET') {
      const videos = await db.collection('videos')
        .find({}, { projection: { title: 1, thumbnail: 1, unlockCount: 1 } })
        .sort({ createdAt: -1 }).toArray();

      return res.status(200).json({
        ok: true,
        videos: videos.map(v => ({ id: v._id, title: v.title, thumbnail: v.thumbnail, unlockCount: v.unlockCount || 0 }))
      });
    }

    // ---------------- VIDEO DETAIL (unlock page) ----------------
    if (type === 'video_detail' && req.method === 'GET') {
      const { ObjectId } = require('mongodb');
      const video = await db.collection('videos').findOne({ _id: new ObjectId(req.query.id) });
      if (!video) return res.status(404).json({ ok: false, error: 'not_found' });

      const unlocked = await db.collection('unlockedVideos').findOne({ userId: telegramId, videoId: String(video._id) });
      const user = await db.collection('users').findOne({ telegramId });

      return res.status(200).json({
        ok: true,
        video: { id: video._id, title: video.title, thumbnail: video.thumbnail, unlockCost: parseFloat(process.env.UNLOCK_COST || '1') },
        alreadyUnlocked: !!unlocked,
        userBalance: user ? user.balance : 0
      });
    }

    // ---------------- TASKS LIST ----------------
    if (type === 'tasks' && req.method === 'GET') {
      const tasks = await db.collection('tasks').find({ active: true }).toArray();
      const completions = await db.collection('taskCompletions').find({ userId: telegramId }).toArray();
      const doneIds = new Set(completions.map(c => String(c.taskId)));

      return res.status(200).json({
        ok: true,
        tasks: tasks.map(t => ({
          id: t._id,
          title: t.title,
          reward: t.reward,
          taskType: t.taskType, // 'normal' | 'verified'
          link: t.link,
          completed: doneIds.has(String(t._id))
        }))
      });
    }

    // ---------------- VERIFY TASK ----------------
    if (type === 'verify_task' && req.method === 'POST') {
      const { ObjectId } = require('mongodb');
      const { taskId } = req.body;
      const task = await db.collection('tasks').findOne({ _id: new ObjectId(taskId) });
      if (!task) return res.status(404).json({ ok: false, error: 'task_not_found' });

      const already = await db.collection('taskCompletions').findOne({ userId: telegramId, taskId: String(taskId) });
      if (already) return res.status(200).json({ ok: true, alreadyCompleted: true });

      if (task.taskType === 'verified') {
        const isMember = await isChannelMember(task.channelId, telegramId);
        if (!isMember) {
          return res.status(400).json({ ok: false, error: 'not_joined' });
        }
      }

      await db.collection('taskCompletions').insertOne({
        userId: telegramId, taskId: String(taskId), completedAt: new Date()
      });
      await db.collection('users').updateOne({ telegramId }, { $inc: { balance: task.reward } });

      const user = await db.collection('users').findOne({ telegramId });
      return res.status(200).json({ ok: true, rewardAdded: task.reward, newBalance: user.balance });
    }

    // ---------------- REFERRAL INFO ----------------
    if (type === 'referral' && req.method === 'GET') {
      const user = await db.collection('users').findOne({ telegramId });
      const botUsername = process.env.BOT_USERNAME || 'your_bot';
      return res.status(200).json({
        ok: true,
        referralLink: `https://t.me/${botUsername}?start=ref_${telegramId}`,
        totalReferrals: user.referralCount || 0,
        bonusRatePct: parseFloat(process.env.REFERRAL_UNLOCK_COMMISSION_PCT || '10')
      });
    }

    return res.status(400).json({ ok: false, error: 'unknown_type' });
  } catch (err) {
    console.error('content.js error:', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
