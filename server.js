const express = require("express");
const app = express();
const cors = require("cors");
const multer = require("multer");


const startQdrantCleanupCron = require('./helper/qdrantCleaner') // 👈 import the cron job
const redis = require('./helper/redisClient')
app.use(cors());
app.use(express.json());

const { OpenAIEmbeddings } = require('@langchain/openai');
const { QdrantVectorStore } = require('@langchain/qdrant');

const OpenAI = require('openai');
const bullmq = require("bullmq");
const dotenv = require("dotenv");
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

const openAiclient = new OpenAI({
  apiKey: process.env.OPENAI_KEY,
});
//server setup
app.listen(8000, () => {
  console.log("Server is running on port 8000");
});

// Start Qdrant cleanup scheduler
startQdrantCleanupCron(); // ✅ runs every hour

const pdfUploadQueue = new bullmq.Queue(process.env.REDIS_QUEUE_NAME, {
  connection: {
    host: 'localhost',
    port: '6379',
  },
});

// receive files using multer api
app.post("/upload/pdf", upload.single("pdf"), async (req, res) => {
  const fileId = `${Date.now()}-${req.file.originalname}`;
  // Save initial status
  await redis.set(`status:${fileId}`, 'processing');

  await pdfUploadQueue.add(
    'file-ready',
    JSON.stringify({
      filename: req.file.originalname,
      destination: req.file.destination,
      path: req.file.path,
      fileId
    })
  );

  return res.json({ message: "uploaded", fileId });
});



// chat api which converts user query to embedded vectors and return SIMILAR TYPE results

app.get("/chat", async (req, res) => {
  const userQuery = req.query.message;

  if (!userQuery) {
    return res.status(200).json({ message: 'please provide your queries', status: false })
  }

  const embeddings = new OpenAIEmbeddings({
    model: 'text-embedding-3-small',
    apiKey: process.env.OPENAI_KEY,
  });

  const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
    url: process.env.QDRANT_STORE,
    collectionName: process.env.QDRANT_COLLECTION1,
  });

  const retriver = vectorStore.asRetriever({
    k: 2,
  });

  const result = await retriver.invoke(userQuery);


  const PROMPT = `You are helfull AI Assistant who answeres the user query based on the available context from PDF File.
Also if you dont have any context , Please ask user to upload pdf file. 
  Context:
  ${JSON.stringify(result)}
  `;



  const chatResult = await openAiclient.chat.completions.create({
    model: 'gpt-4.1',
    messages: [
      { role: 'system', content: PROMPT },
      { role: 'user', content: userQuery },
    ],
  });

  return res.json({
    message: chatResult.choices[0].message.content,
    docs: result,
  });


})

//check the file processing status
app.get('/status/:fileId', async (req, res) => {
  const status = await redis.get(`status:${req.params.fileId}`);
  return res.json({ status });
});



// clean up redis keys
// make the chat ui
// take context of previous chats
//chat screen ui
//add firebase auth
// 




