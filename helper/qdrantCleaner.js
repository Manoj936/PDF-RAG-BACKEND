// qdrant-cleaner.js
const { QdrantClient } = require('@qdrant/js-client-rest');
const cron = require('node-cron');
const dotenv = require("dotenv");
dotenv.config();

const deleteObjectsFromQdrant = async () => {
    const Qdrclient = new QdrantClient({ url: process.env.QDRANT_STORE });
    const cutoff = Date.now() - 1000 * 60 * 60 * 24; // 24 hours ago

    await Qdrclient.delete({
        collection_name: 'langchainjs-testing',
        filter: {
            must: [
                {
                    key: 'uploadedAt',
                    range: {
                        lt: cutoff,
                    },
                },
            ],
        },
    });

    console.log('🧹 Old documents deleted');
};

// Export the scheduler to be called in the main app
const startQdrantCleanupCron = () => {
    cron.schedule('0 * * * *', () => {
        deleteObjectsFromQdrant();
    });
};

module.exports = startQdrantCleanupCron;