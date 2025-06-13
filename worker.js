import { Worker } from "bullmq";
import redis from "./helper/redisClient.js";
import { createClient } from "@supabase/supabase-js";

// Langchain imports
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";

import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf"; //👈🏼 used for pdf parshing
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx"; //👈🏼 used for doc parshing

import { OpenAIWhisperAudio } from "@langchain/community/document_loaders/fs/openai_whisper_audio"; //👈🏼 used for audio parshing
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const openAIKey = process.env.OPENAI_KEY;
const supabaseUrl = process.env.SUPABASE_PROJECT_URL;
const supabaseApikey = process.env.SUPABASE_API_KEY;

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
  apiKey: openAIKey,
});

//subscriber for doc upload events
const worker = new Worker(
  process.env.REDIS_QUEUE_NAME,
  async (job) => {
    const data = JSON.parse(job.data);
    try {
      // File processing
      let loader;
      console.log(data.fileType , "🗃️")
      if (data.fileType == "pdf") {
        //pdf parsing
        loader = new PDFLoader(data.path);
      } else if ( data.fileType == "docx") {
        //doc parsing
        loader = new DocxLoader(data.path, {
          type: data.fileType,
        });
      }else{
        throw new Error("Unsupported file type");
      }

      const docs = await loader.load();
      console.log(typeof docs);
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 500, // smaller chunk size
        separators: ["\n\n", "\n", " ", ""],
        chunkOverlap: 50,
      });
      const splitDocs = await splitter.splitDocuments(docs);

      const supClient = createClient(supabaseUrl, supabaseApikey);

      // // ✅ Batch insertion
      const BATCH_SIZE = 100;
      for (let i = 0; i < splitDocs.length; i += BATCH_SIZE) {
        const batch = splitDocs.slice(i, i + BATCH_SIZE).map((doc) => {
          // Add file_id to metadata
          return {
            ...doc,
            metadata: {
              ...(doc.metadata || {}),
              file_id: data.fileId, // 👈 your custom file ID
              email: data.email ? data.email : null, // 👈 your custom account ID
            },
          };
        });

        //Save to pgvector
        await SupabaseVectorStore.fromDocuments(batch, embeddings, {
          client: supClient, // 👈 fix here
          tableName: "documents",
        });
      }

      await redis.set(`status:${data.fileId}`, "processed");
      console.log(`All docs are added to vector store ✅`);

      // 🧹 Delete file after processing
      await fs.unlink(data.path, (err) => {
        if (err) {
          console.log("❌ Error deleting file:", err);
        } else {
          console.log(`🗑️ Deleted file: ${data.path}`);
        }
      });
    } catch (e) {
      console.log("❌ Job processing error:", e);
      if (data?.path) {
        try {
          await fs.promises.unlink(data.path);
          console.log("🗑️ Cleanup: File deleted after failure");
        } catch (delErr) {
          console.error("❌ Cleanup: Failed to delete file:", delErr);
        }
      }

      if (data?.fileId) {
        await redis.set(`status:${data.fileId}`, "failed");
      }
    }
  },
  {
    concurrency: 100,
    connection: {
      url: `rediss://default:${process.env.REDIS_PASS}@real-stinkbug-39224.upstash.io:6379`,
    },
  }
);

worker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} completed.`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job ${job.id} failed with error:`, err);
});

worker.on("error", (err) => {
  console.error("❌ Worker encountered an internal error:", err);
});
