import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import dotenv from "dotenv";
dotenv.config();
const openAIApiKey = process.env.OPENAI_KEY;
const llm = new ChatOpenAI({ openAIApiKey });

export async function standaloneQuestionGenerator(query) {
  const standaloneQuestionTemplate =
    "Generate a standalone question from the question itself. If the prompt contains only greetings then greet back politely and ask to post question. the question is: {question}";

  const promtTemplate = PromptTemplate.fromTemplate(standaloneQuestionTemplate);

  const standaloneQuestionChain = promtTemplate.pipe(llm);

  const AIResponse = await standaloneQuestionChain.invoke({
    question: query,
  });
  console.log(AIResponse.content);
  return AIResponse.content;
}
