import express from "express";
const app = express();
import cors from "cors";
import multer from "multer";
import redis from "./helper/redisClient.js";
app.use(cors());
app.use(express.json());
import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import OpenAI from "openai";
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
  connection:  redis
});

// receive files using multer api
app.post("/upload/pdf", upload.single("pdf"), async (req, res) => {
  const fileId = `${Date.now()}-${req.file.originalname}`;
  // Save initial status
  await redis.set(`status:${fileId}`, "processing");

  await pdfUploadQueue.add(
    "file-ready",
    JSON.stringify({
      filename: req.file.originalname,
      destination: req.file.destination,
      path: req.file.path,
      fileId,
    })
  );

  return res.json({ message: "uploaded", fileId });
});

// chat api which converts user query to embedded vectors and return SIMILAR TYPE results

app.get("/chat", async (req, res) => {
  const userMSg = req.query.message;
  const collection = req.query.fileId;
  if (!userMSg) {
    return res
      .status(200)
      .json({ message: "please provide your queries", status: false });
  }

  // Process user query to standalone question
  const userQuery = await standaloneQuestionGenerator(userMSg);

  //SETTING UP VECTOR STORE AND RETRIVING
  const supClient = createClient(supabaseUrl, supabaseApikey);

  const vectorStore = new SupabaseVectorStore(embeddings, {
    client: supClient, // 👈 fix here
    tableName: "documents",
    queryName: "match_documents",
  });

  const retriver = vectorStore.asRetriever();

  const result = await retriver.invoke(userQuery);

  const LLM_PROMPT = `You are a helpful and enthusiastic support bot who can answer a given question about the context provided. Try to find the answer in detail from the context. If you really don't know the answer, say "I'm sorry, I don't know find an appropriate answer". Don't try to make up an answer. Always speak as if you were chatting to a friend. 
    Context: {result}
    Question: {question}`;

  const LLMpromtTemplate = PromptTemplate.fromTemplate(LLM_PROMPT);

  const AIRESPONSE_CHAIN = LLMpromtTemplate.pipe(llm);

  const AIResponse = await AIRESPONSE_CHAIN.invoke({
    result: JSON.stringify(result),
    question: userMSg,
  });
  console.log(AIResponse);

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

// clean up redis keys
// make the chat ui
// take context of previous chats
//chat screen ui
//add firebase auth
//
