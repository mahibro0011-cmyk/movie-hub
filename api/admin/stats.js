const { getDb } = require('../../lib/db');
const { isAdminAuthed } = require('../../lib/auth');

module.exports = async (req, res) => {
  try {
    if (!isAdminAuthed(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const db = await getDb();
    const view = req.query.view;

    // ---------------- DASHBOARD OVERVIEW ----------------
    if (view === 'overview' || !view) {
      const [userCount, videoCount, taskCount, unlockCount, adAgg] = await Promise.all([
        db.collection('users').countDocuments(),
        db.collection('videos').countDocuments(),
        db.collection('tasks').countDocuments({ active: true }),
        db.collection('unlockedVideos').countDocuments(),
        db.collection('users').aggregate([
          { $group: { _id: null, totalAdsWatched: { $sum: '$totalAdsWatched' }, totalBalance: { $sum: '$balance' } } }
        ]).toArray()
      ]);

      return res.status(200).json({
        ok: true,
        stats: {
          totalUsers: userCount,
          totalVideos: videoCount,
          activeTasks: taskCount,
          totalUnlocks: unlockCount,
          totalAdsWatched: adAgg[0]?.totalAdsWatched || 0,
          totalDhcInCirculation: adAgg[0]?.totalBalance || 0
        }
      });
    }

    // ---------------- USER LIST (with search/pagination) ----------------
    if (view === 'users') {
      const page = parseInt(req.query.page || '1', 10);
      const limit = 50;
      const search = req.query.search;

      const filter = search
        ? { $or: [{ username: new RegExp(search, 'i') }, { firstName: new RegExp(search, 'i') }, { telegramId: search }] }
        : {};

      const [users, total] = await Promise.all([
        db.collection('users').find(filter).sort({ createdAt: -1 })
          .skip((page - 1) * limit).limit(limit).toArray(),
        db.collection('users').countDocuments(filter)
      ]);

      return res.status(200).json({ ok: true, users, total, page, pages: Math.ceil(total / limit) });
    }

    // ---------------- TOP REFERRERS ----------------
    if (view === 'top_referrers') {
      const top = await db.collection('users')
        .find({ referralCount: { $gt: 0 } })
        .sort({ referralCount: -1 })
        .limit(20)
        .toArray();
      return res.status(200).json({
        ok: true,
        referrers: top.map(u => ({ telegramId: u.telegramId, username: u.username, firstName: u.firstName, referralCount: u.referralCount, balance: u.balance }))
      });
    }

    return res.status(400).json({ ok: false, error: 'unknown_view' });
  } catch (err) {
    console.error('admin/stats.js error:', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
