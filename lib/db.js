const { MongoClient } = require('mongodb');

// Cache the connection across function invocations (serverless best practice)
let cachedClient = null;
let cachedDb = null;

async function getDb() {
  if (cachedDb) return cachedDb;

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set');
  }

  if (!cachedClient) {
    cachedClient = new MongoClient(process.env.MONGODB_URI);
    await cachedClient.connect();
  }

  cachedDb = cachedClient.db('dramacoin');

  // Ensure indexes exist (safe to call repeatedly - no-op if already present)
  await cachedDb.collection('users').createIndex({ telegramId: 1 }, { unique: true });
  await cachedDb.collection('videos').createIndex({ createdAt: -1 });
  await cachedDb.collection('pendingUploads').createIndex({ code: 1 }, { unique: true });
  await cachedDb.collection('unlockedVideos').createIndex({ userId: 1, videoId: 1 }, { unique: true });
  await cachedDb.collection('taskCompletions').createIndex({ userId: 1, taskId: 1 }, { unique: true });

  return cachedDb;
}

module.exports = { getDb };
