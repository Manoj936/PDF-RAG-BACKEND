import express, { json } from "express";
const app = express();
import cors from "cors";
import multer from "multer";
app.use(cors());
app.use(express.json());
import path from "path";
import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { HumanMessage  , AIMessage} from "@langchain/core/messages";
import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";

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

import { DocumentWorker, WebScrapperWorker } from "./worker.js";
import {
  isAllowedByRobots,
  isHtmlContent,
  isUrlReachable,
} from "./helper/scrapperHelper.js";
import {
  greetingKeywords,
} from "./helper/constant.js";
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from "@langchain/core/prompts";
import { human_template_01, system_template_01 } from "./helper/template.js";
import {
    StringOutputParser,
} from "@langchain/core/output_parsers";


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

// receive files using multer api
app.post("/upload/pdf", upload.single("pdf"), async (req, res) => {
  try {
    const fileId = `${Date.now()}-${req.file.originalname}`;
    const email = req.body.email;
    const fileType = path
      .extname(req.file.originalname)
      .toLowerCase()
      .substring(1);

    await DocumentWorker(
      JSON.stringify({
        filename: req.file.originalname,
        destination: req.file.destination,
        path: req.file.path,
        fileType,
        fileId,
        email,
      }),
      res
    );
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Error processing file" });
  }
});

// chat api which converts user query to embedded vectors and return SIMILAR TYPE results

app.get("/chat", async (req, res) => {
  const userMSg = req.query.message;
  const fileId = req.query.fileId;
  const email = req.query.email;
  const filename = req.query.filename;
  const url = req.query.url;
  const requestType = req.query.requestType;
  console.log(userMSg, fileId, email, filename, url, requestType);
  if (!requestType) {
    return res.status(400).json({ message: "Invalid request", status: false });
  }

  if (!userMSg) {
    return res
      .status(200)
      .json({ message: "please provide your queries", status: false });
  }

  //Check if only greetings then return greeting response
  const lowerMsg = userMSg.toLowerCase().trim();

  if (greetingKeywords.includes(lowerMsg)) {
    const greetingResponse = `Hello! 😊 How can I assist you today? Feel free to ask any question regarding your ${
      filename ? `file: "${filename}"` : `scraped URL: "${url}"`
    }.`;

    await supClient.from("chat_history").insert([
      { email, ref_id: fileId, role: "user", message: userMSg },
      { email, ref_id: fileId, role: "ai", message: greetingResponse },
    ]);

    return res.status(200).json({
      message: greetingResponse,
      docs: [],
    });
  }

  // Process user query to standalone question if anything other than greetings
  const userQuery = await standaloneQuestionGenerator(userMSg);

  let vectorStore;

  vectorStore = new SupabaseVectorStore(embeddings, {
    client: supClient, // 👈 fix here
    tableName: "documents",
    queryName: "match_documents",
    filter: { file_id: fileId, email: email }, // 👈 filter by file_id and email
  });
  console.log(fileId,email , '😔')
  const retriver = vectorStore.asRetriever({ k: 2 });
  console.log("🔍 Retrieving documents for query:", userQuery);
  const result = await retriver.invoke(userQuery);
  console.log("🧠 Retriever Result:", result);
  const chatHistory = await getPrevConversation(email, fileId);

  // 1. System prompt: sets the assistant's behavior
  const systemMessage = SystemMessagePromptTemplate.fromTemplate(system_template_01);

  // 2. Human message: contains the actual dynamic content
  const humanMessage = HumanMessagePromptTemplate.fromTemplate(human_template_01);

  // 3. Create full chat prompt
  const chatPrompt = ChatPromptTemplate.fromMessages([
    systemMessage,
    humanMessage,
  ]);

  // 4. Chain it to your LLM
  const AIRESPONSE_CHAIN = chatPrompt.pipe(llm).pipe(new StringOutputParser());

  // 5. Invoke with your variables
  const AIResponse = await AIRESPONSE_CHAIN.invoke({
    result: JSON.stringify(result),
    question: userMSg,
    chatHistory: chatHistory,
    email: email,
    filename: filename ? filename : "null",
    url: url ? url : "null",
  });
  console.log(AIResponse , "🤖")
  //chat history can be added here
  await supClient.from("chat_history").insert([
    { email, ref_id: fileId, role: "user", message: userMSg },
    { email, ref_id: fileId, role: "ai", message: AIResponse },
  ]);
  return res.json({
    message: AIResponse,
    docs: result,
  });
});

app.post("/scraper", async (req, res) => {
  try {
    console.log(req.body);
    const { url, email } = req.body;

    if (
      (await isUrlReachable(url)) &&
      (await isHtmlContent(url)) &&
      (await isAllowedByRobots(url))
    ) {
      //Call worker to process the url scrapping
      const fileId = `url_${Date.now()}-${url
        .replace(/[^a-zA-Z0-9]/g, "_")
        .slice(0, 10)}`;
      // Here you can implement the logic to scrape the URL and process the data

      await WebScrapperWorker(JSON.stringify({ url, email, fileId }), res);
    } else {
      return res
        .status(200)
        .json({ message: "URL is not scrapable", status: false });
    }
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Error processing request" });
  }
});

async function getPrevConversation(email, reference) {
  const { data: history } = await supClient
    .from("chat_history")
    .select("role,message")
    .eq("email", email)
    .eq("ref_id", reference)
    .order("created_at", { ascending: true })
    .limit(10); // last 5 interactions


   console.log(history , "📔📔") 

   
  const chatHistory = [];
  history.forEach((item) => {
    if (item.role === "user") {
      chatHistory.push(new HumanMessage(item.message));
    } else {
      chatHistory.push(new AIMessage(item.message));
    }
    
  })
  console.log('****************************');
  console.log(chatHistory);
  console.log('****************************')
  return chatHistory;
}
