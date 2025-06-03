const { QdrantClient } = require('@qdrant/js-client-rest');
const cron = require('node-cron');
const dotenv = require("dotenv");
dotenv.config();

const deleteOldCollections = async () => {
  const client = new QdrantClient({ url: process.env.QDRANT_STORE });

  const allCollections = await client.getCollections();
  const cutoff = Date.now() - 1000 * 60 * 60 * 24; // 24 hours ago

  for (const collection of allCollections.collections) {
    const name = collection.name;

    if (name.startsWith('pdf_')) {
      const fileId = name.split('_')[1]; // e.g., "1748945011132-CSS.pdf"

      const timestampStr = fileId.split('-')[0]; // e.g., "1748945011132"
      const timestamp = parseInt(timestampStr);

      if (!isNaN(timestamp) && timestamp < cutoff) {
        await client.deleteCollection(name);
        console.log(`🧹 Deleted old collection: ${name}`);
      }
    }
  }
};

// Export cron job
const startQdrantCleanupCron = () => {
  cron.schedule('0 * * * *', () => {
    deleteOldCollections();
  });
};

module.exports = startQdrantCleanupCron;
