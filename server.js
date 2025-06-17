import express from "express";
const app = express();
import cors from "cors";
import multer from "multer";
import redis from "./helper/redisClient.js";
app.use(cors());
app.use(express.json());
import path from 'path';
import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import bullmq from "bullmq";
import dotenv from "dotenv";
import { standaloneQuestionGenerator } from "./helper/standaloneClient.js";
const openAIApiKey = process.env.OPENAI_KEY;
const supabaseUrl = process.env.SUPABASE_PROJECT_URL;
const supabaseApikey = process.env.SUPABASE_API_KEY;
const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
  apiKey: openAIApiKey,
});
const llm = new ChatOpenAI({ openAIApiKey });
dotenv.config();

import { Ratelimiter } from "./helper/rateLimiter.js";
import { createWorker } from "./worker.js";



const supClient = createClient(supabaseUrl, supabaseApikey);
//storage setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "--" + file.originalname);
  },
});
const upload = multer({ storage: storage });

//server setup
app.listen(8000, () => {
  console.log("Server is running on port 8000");
});

const pdfUploadQueue = new bullmq.Queue(process.env.REDIS_QUEUE_NAME, {
  connection: redis,
});

// receive files using multer api
app.post(
  "/upload/pdf",
  Ratelimiter("upload/pdf", 3, 60),
  upload.single("pdf"),
  async (req, res) => {
    try {
      const fileId = `${Date.now()}-${req.file.originalname}`;
      const email = req.body.email;
      const fileType = path.extname(req.file.originalname).toLowerCase().substring(1);
      // Save initial status
      await redis.set(`status:${fileId}`, "processing");
      console.log(fileType);

      await pdfUploadQueue.add(
        "file-ready",
        JSON.stringify({
          filename: req.file.originalname,
          destination: req.file.destination,
          path: req.file.path,
          fileType,
          fileId,
          email,
        })
      );

      const worker = createWorker()
      await worker.run();           
  
      return res.json({ message: "uploaded", fileId });
    } catch (err) {
      console.log(err);
      return res.status(500).json({ message: "Error processing file" });
    }
  }
);

// chat api which converts user query to embedded vectors and return SIMILAR TYPE results

app.get("/chat", Ratelimiter("chat", 10, 60), async (req, res) => {
  const userMSg = req.query.message;
  const fileId = req.query.fileId;
  const email = req.query.email;
  const filename = req.query.filename;
  if (!userMSg) {
    return res
      .status(200)
      .json({ message: "please provide your queries", status: false });
  }

  // Process user query to standalone question
  const userQuery = await standaloneQuestionGenerator(userMSg);

  const vectorStore = new SupabaseVectorStore(embeddings, {
    client: supClient, // 👈 fix here
    tableName: "documents",
    queryName: "match_documents",
    filter: { file_id: fileId, email: email }, // 👈 filter by file_id and email
  });

  const retriver = vectorStore.asRetriever();

  const result = await retriver.invoke(userQuery);
  const chatHistory = await getPrevConversation(email, fileId);
  console.log(chatHistory, "🧠");
  const LLM_PROMPT = `
  You are a helpful and friendly support assistant. You answer user questions based on the provided document context and optionally prior chat history.
  
  Respond with:
  - A friendly and conversational tone.
  - Factual answers only when they exist in the provided context.
  - If the question is a casual greeting like "hi", "hello", or "how are you", respond warmly and naturally.
  - If the answer is not found in the context and the question is not a greeting, respond with:
    "I'm sorry, I couldn't find an appropriate answer in the document."
  - Also note for now the system only accept pdf and docx file.
  
  Information provided:
  -------------------------
  Context: {result}
  
  Previous Conversation: {chatHistory}
  
  User Question: {question}
  User Email: {email}
  File Name : {filename}
  -------------------------
  
  Answer:
  `;

  const LLMpromtTemplate = PromptTemplate.fromTemplate(LLM_PROMPT);

  const AIRESPONSE_CHAIN = LLMpromtTemplate.pipe(llm);

  const AIResponse = await AIRESPONSE_CHAIN.invoke({
    result: JSON.stringify(result),
    question: userMSg,
    chatHistory: chatHistory,
    email: email,
    filename: filename
  });
  //chat history can be added here
  await supClient.from("chat_history").insert([
    { email, file_id: fileId, role: "user", message: userMSg },
    { email, file_id: fileId, role: "ai", message: AIResponse.content },
  ]);
  return res.json({
    message: AIResponse.content,
    docs: result,
  });
});

//check the file processing status
app.get("/status/:fileId", async (req, res) => {
  const status = await redis.get(`status:${req.params.fileId}`);
  return res.json({ status });
});

async function getPrevConversation(email, fileId) {
  const { data: history } = await supClient
    .from("chat_history")
    .select("role,message")
    .eq("email", email)
    .eq("file_id", fileId)
    .order("created_at", { ascending: true })
    .limit(10); // last 5 interactions

  const chatHistory = history
    .map((h) => `${h.role === "user" ? "User" : "AI"}: ${h.message}`)
    .join("\n");
  return chatHistory;
}
