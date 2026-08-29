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

    await cachedDb.collection('users').createIndex({ telegramId: 1 }, { unique: true });
    await cachedDb.collection('videos').createIndex({ createdAt: -1 });
    await cachedDb.collection('videos').createIndex({ categoryIds: 1 });
    await cachedDb.collection('pendingUploads').createIndex({ code: 1 }, { unique: true });
    await cachedDb.collection('unlockedVideos').createIndex({ userId: 1, videoId: 1 }, { unique: true });
    await cachedDb.collection('taskCompletions').createIndex({ userId: 1, taskId: 1 }, { unique: true });
    await cachedDb.collection('categories').createIndex({ name: 1 }, { unique: true });
    await cachedDb.collection('withdrawals').createIndex({ userId: 1, createdAt: -1 });
    await cachedDb.collection('withdrawals').createIndex({ status: 1 });

    return cachedDb;
  } catch (err) {
    cachedClient = null;
    cachedDb = null;
    throw err;
  }
}

module.exports = { getDb };
