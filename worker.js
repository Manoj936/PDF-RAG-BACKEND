//Supabase package
import { createClient } from "@supabase/supabase-js";
// Langchain imports
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";

import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf"; //👈🏼 used for pdf parshing
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx"; //👈🏼 used for doc parshing
import { OpenAIWhisperAudio } from "@langchain/community/document_loaders/fs/openai_whisper_audio"; //👈🏼 used for audio parshing
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import fs from "fs";
import dotenv from "dotenv";
import { fileUploadRequest, webUrlScrappingRequest } from "./helper/constant.js"; 

dotenv.config();

const openAIKey = process.env.OPENAI_KEY;
const supabaseUrl = process.env.SUPABASE_PROJECT_URL;
const supabaseApikey = process.env.SUPABASE_API_KEY;

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
  apiKey: openAIKey,
});

// convert a document to vector embeddings and save to supabase
export const DocumentWorker = async (rawData, res) => {
  const data = JSON.parse(rawData);
  try {
    // File processing
    let loader;
    console.log(data.fileType, "🗃️");
    if (data.fileType == "pdf") {
      //pdf parsing
      loader = new PDFLoader(data.path);
    } else if (data.fileType == "docx") {
      //doc parsing
      loader = new DocxLoader(data.path, {
        type: data.fileType,
      });
    } else {
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
    console.log(`✅ All docs added to vector store`);
    await fs.promises.unlink(data.path);
    return res.status(200).json({
      message: "File Processed",
      status: true,
      requestType : fileUploadRequest,
      filename: data.filename,
      fileId: data.fileId,
    });
  } catch (e) {
    if (data?.path) await fs.promises.unlink(data.path).catch(() => {});
    return res
      .status(500)
      .json({ message: "Error processing file", status: false });
  }
};

// scrape the website make its embeddings and save to supabase

export const WebScrapperWorker = async (rawData, res) => {
  try {
    const data = JSON.parse(rawData);
    const url = data.url;
    if (!url) throw new Error("Missing URL");

    // Instantiate loader with optional selector to trim content
    const loader = new CheerioWebBaseLoader(url, {
      selector: "body", // broader selector
    });

    // Load the documents
    let docs = await loader.load();
    docs = docs.map(doc => ({
      ...doc,
      pageContent: doc.pageContent
        .replace(/<[^>]+>/g, "")   // remove HTML tags
        .replace(/\s+/g, " ")      // normalize whitespace
        .trim(),
    }));
    console.log("📄 Loaded Docs from Web:", docs.map(d => d.pageContent.slice(0, 100)));
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500, // smaller chunk size
      separators: ["\n\n", "\n", " ", ""],
      chunkOverlap: 50,
    });
    const splitDocs = await splitter.splitDocuments(docs);

    const supClient = createClient(supabaseUrl, supabaseApikey);
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
    console.log(`✅ All html added to vector store`);
    return res.status(200).json({
      message: "Url Processed",
      status: true,
      requestType : webUrlScrappingRequest,
      fileId: data.fileId,
      url : data.url
    });
  } catch (e) {
    console.error(e);
    res.status(500).send({ error: e.message });
  }
};
