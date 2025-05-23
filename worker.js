const { Worker } = require("bullmq");
const redis = require('./helper/redisClient');
// Langchain imports

const { OpenAIEmbeddings } = require('@langchain/openai');
const { QdrantVectorStore } = require('@langchain/qdrant');
const { PDFLoader } = require('@langchain/community/document_loaders/fs/pdf');
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const fs = require('fs')
const dotenv = require("dotenv");
dotenv.config();

//subscriber for doc upload events
const worker = new Worker(
  process.env.REDIS_QUEUE_NAME,
  async (job) => {
    console.log(JSON.parse(job.data));
    const data = JSON.parse(job.data);
    try {
      // Pdf processing
      const loader = new PDFLoader(data.path);
      const docs = await loader.load();



      const embeddings = new OpenAIEmbeddings({
        model: 'text-embedding-3-small',
        apiKey: process.env.OPENAI_KEY,
      });
      const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
        url: process.env.QDRANT_STORE,
        collectionName: process.env.QDRANT_COLLECTION1,
      });
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 500,  // smaller chunk size
        chunkOverlap: 50,
      });

      const splitDocs = await splitter.splitDocuments(docs);
      // ✅ Batch insertion
      const BATCH_SIZE = 100;
      for (let i = 0; i < splitDocs.length; i += BATCH_SIZE) {
        const batch = splitDocs.slice(i, i + BATCH_SIZE);
        await vectorStore.addDocuments(batch);
      }
      await redis.set(`status:${data.fileId}`, 'processed');
      console.log(`All docs are added to vector store ✅`);

      // 🧹 Delete file after processing
      await fs.unlink(data.path, (err) => {
        if (err) {
          console.error('❌ Error deleting file:', err);
        } else {
          console.log(`🗑️ Deleted file: ${data.path}`);
        }
      });

    }
    catch (e) {
      console.log('error', e)
      await redis.set(`status:${data.fileId}`, 'failed');
    }

  },
  {
    concurrency: 100,
    connection: {
      host: 'localhost',
      port: 6379,
    },
  }
);
