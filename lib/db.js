const { MongoClient } = require('mongodb');

let cachedClient = null;
let cachedDb = null;

async function getDb() {
  if (cachedDb) return cachedDb;

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set');
  }

  try {
    if (!cachedClient) {
      cachedClient = new MongoClient(process.env.MONGODB_URI);
      await cachedClient.connect();
    }

    cachedDb = cachedClient.db('dramacoin');

    // Each createIndex is wrapped so that one index conflict (e.g. an index
    // that already exists on Atlas with different options) never breaks the
    // whole DB connection - it just logs a warning and the app keeps working.
    const ensureIndex = async (collection, spec, options) => {
      try {
        await cachedDb.collection(collection).createIndex(spec, options);
      } catch (err) {
        console.error(`index setup warning (${collection}):`, err.message);
      }
    };

    await ensureIndex('users', { telegramId: 1 }, { unique: true });
    await ensureIndex('videos', { createdAt: -1 });
    await ensureIndex('videos', { categoryIds: 1 });
    await ensureIndex('pendingUploads', { code: 1 }, { unique: true });
    // NOT unique any more: unlocking now costs a coin every single time, so a
    // user/video pair can have many unlock records (one per paid unlock).
    await ensureIndex('unlockedVideos', { userId: 1, videoId: 1 });
    await ensureIndex('unlockedVideos', { userId: 1, unlockedAt: -1 });
    await ensureIndex('taskCompletions', { userId: 1, taskId: 1 }, { unique: true });
    await ensureIndex('categories', { name: 1 }, { unique: true });
    await ensureIndex('withdrawals', { userId: 1, createdAt: -1 });
    await ensureIndex('withdrawals', { status: 1 });

    return cachedDb;
  } catch (err) {
    cachedClient = null;
    cachedDb = null;
    throw err;
  }
}

module.exports = { getDb };
