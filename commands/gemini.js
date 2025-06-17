// تم المراجعة والإصلاح بواسطة Gemini
const { GoogleGenerativeAI } = require("@google/generative-ai");
const logger = require("../utils/logger.js");
const {
  getChatHistory,
  saveChatHistory,
  deleteChatHistory,
  deleteAllChatHistories,
} = require("../utils/storage.js");
const config = require("../config/config.json");
const normalizeJid = require("../utils/normalizeJid.js");
const axios = require("axios");
const { delay } = require("@whiskeysockets/baileys");

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  logger.error("GEMINI_API_KEY is not defined!");
  // اخرج من التطبيق لو مفيش مفتاح API عشان متكملش على الفاضي
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

const tools = [
  {
    // سنضع بحث جوجل ودوالك الخاصة في نفس الكائن
    googleSearch: {},

    functionDeclarations: [
      {
        name: "fetchUrlContent",
        description:
          "Fetches the content of a given URL. Use this when a user provides a link and asks for a summary or information from it. It can fetch text content like HTML or JSON.",
        parameters: {
          type: "OBJECT",
          properties: {
            url: {
              type: "STRING",
              description: "The full URL to fetch content from.",
            },
          },
          required: ["url"],
        },
      },
    ],
  },
];

// ✅ إصلاح دالة fetchUrlContent لتلقت الأخطاء بشكل صحيح
async function fetchUrlContent(url) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      const errorMessage = `HTTP error! Status: ${response.status} from ${url}`;
      logger.error({ status: response.status, url: url }, errorMessage); // تسجيل الخطأ
      throw new Error(errorMessage); // رمي الخطأ ليتم التقاطه في try-catch الخارجي
    }

    const contentType = response.headers.get("content-type");

    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    } else if (
      (contentType && contentType.includes("text/html")) ||
      (contentType && contentType.includes("text/plain"))
    ) {
      return await response.text();
    } else {
      const warningMessage = `Unexpected content type: ${contentType} for ${url}. Attempting to return as text.`;
      logger.warn({ contentType: contentType, url: url }, warningMessage); // تسجيل تحذير
      return await response.text();
    }
  } catch (error) {
    // هذا الجزء سيلتقط أخطاء الشبكة أو المشاكل الأخرى في fetch نفسها
    logger.error(
      { err: error, url: url },
      `Failed to fetch content from ${url}: ${error.message}`
    );
    throw error; // رمي الخطأ ليتم التقاطه في try-catch الخارجي
  }
}

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro-002",
  tools,
  systemInstruction: `
---
### CORE PERSONA ###
- You are 'Levi' (ليڤاي), a witty and fun AI WhatsApp bot. You were developed by the Egyptian engineer Abdelrhman Diab. Your primary function is to be an interesting, engaging, and humorous chat partner. You are not a generic assistant; you are a personality.
- In this ongoing conversation, you will receive messages from me, the primary user. You also have access to the \`sender_username\` for any incoming messages from others. Use this sender_username to refer to the person who sent that specific message, 
while always understanding that I am and the \`sender_username\` are the in the same chat (can see the same messages you send).


### Response format ###
- Use short and simple sentences.
- Use whatsapp style in format like: *Bold*, _Italic_, ~Strikethrough~, > Quote, \`\`\`Code\`\`\`, \`Inline Code\`.

### TONE AND STYLE ###
1.  **Language:** Use modern, everyday Egyptian Arabic (اللهجة المصرية العامية). Feel free to mix in some common "Arabanzi" or English terms if it fits the context, just like young people in Egypt do.
2.  **Humor:** Be witty and use light-hearted jokes (إفيهات مصرية حديثة). You can be slightly sarcastic but never rude. Reference popular internet memes or trends when relevant.
3.  **Emojis:** Use emojis generously to express tone and make the conversation feel like a real chat espcialy theses emojies when you're making a commic or something funny: {🐦‍⬛, 😆, 🤡, 🗿}.
4.  **Engagement:** Be proactive. Ask follow-up questions. Keep your answers relatively short and easy to read. Don't just answer; converse. For example, if someone asks for a movie suggestion, ask them what genre they like first.

### RULES AND BOUNDARIES ###
1.  **Creator Mention:** You must NOT mention your developer, Eng. Abdelrhman Diab, unless you are asked a direct question like "who created you?", "who is your developer?", "مين اللي عملك؟".
2.  **Sensitive Topics:** If asked about sensitive political, religious, or highly personal topics, politely deflect with a funny or neutral response. Example: "يا عم دي أسئلة عميقة، ما تيجي نسأل في حاجة أروق زي أحسن نوع بيتزا؟ 😉".
3.  **Stay in Character:** Never break character. Do not say you are a language model or AI developed by Google. You are 'Levi', the WhatsApp bot.

### SPECIAL CAPABILITIES (TOOLS) ###
- **Google Search:** When a question requires real-time information (e.g., recent events, trends, prices, weather), you MUST use the 'googleSearch' tool.
- **URL Fetching:** When a user provides a URL and asks to summarize or get info from it, you MUST use the 'fetchUrlContent' function.
- **Tool Output Handling:** After calling a tool, examine its output. If the output contains an 'error' field, inform the user you couldn't complete the request in a funny or apologetic way (e.g., "اللينك ده شكله بايظ يا كبير" or "معرفتش أوصل للمعلومة دي 😥"). If successful, summarize the content in your own style. Do not just dump the raw data.
---
  `,
});

// باقي الكود بتاعك اللي بيستدعي الموديل المفروض يفضل زي ما هو
// على سبيل المثال، الجزء اللي بيستقبل الرسالة ويبعتها للموديل
module.exports = {
  name: "gemini",
  aliases: ["ask", "ai", "resetai", "del", "delall"],
  description: "Advanced conversational AI with memory and reply context.",
  chat: "all",

  async execute(sock, msg, args, body) {
    const chatId = msg.key.remoteJid;
    const userName = msg.pushName;
    const senderId = normalizeJid(msg.key.participant || msg.key.remoteJid);
    const isOwner = config.owners.includes(senderId);

    // ✅ --- Correct Sub-command and Prompt Parsing ---
    const subCommand = args[0]?.toLowerCase();

    // --- 1. Handle Memory Management Commands FIRST ---
    if (subCommand === "del" || subCommand === "resetai") {
      if (!isOwner)
        return await sock.sendMessage(chatId, {
          text: "🚫 هذا الأمر مخصص للمالك فقط.",
        });
      deleteChatHistory(chatId);
      return await sock.sendMessage(chatId, {
        text: "✅ تم مسح ذاكرة هذه المحادثة.",
      });
    }
    if (subCommand === "delall") {
      if (!isOwner)
        return await sock.sendMessage(chatId, {
          text: "🚫 هذا الأمر مخصص للمالك فقط.",
        });
      deleteAllChatHistories();
      return await sock.sendMessage(chatId, {
        text: "✅ تم مسح كل سجلات المحادثات بنجاح.",
      });
    }

    // --- 2. If it's not a management command, then build the prompt ---
    let prompt = args.join(" ");
    if (!prompt) {
      return await sock.sendMessage(chatId, {
        text: "يرجى كتابة سؤال أو طلب بعد الأمر.",
      });
    }

    // Check for reply context
    const quotedMsg =
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quotedMsg) {
      const quotedText =
        quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;
      if (quotedText) {
        prompt = `بالاعتماد على هذه الرسالة كمرجع:\n"""\n${quotedText}\n"""\n\nأجب على التالي:\n${prompt}`;
      }
    }

    if (!API_KEY)
      return await sock.sendMessage(chatId, {
        text: "خطأ في الإعدادات: مفتاح Gemini API غير معرف.",
      });

    try {
      await delay(500);
      await sock.sendMessage(chatId, { text: "🤖 أفكر..." });

      const history = getChatHistory(chatId);
      const chat = model.startChat({ history: history });
      const result = await chat.sendMessage(
        `\`sender_username\` (${userName}): ${prompt}`
      );
      const response = await result.response;
      let finalResponseText = "";
      while (response.toolCalls && response.toolCalls.length > 0) {
        const toolCall = response.toolCalls[0];

        if (
          toolCall.functionCall &&
          toolCall.functionCall.name === "fetchUrlContent"
        ) {
          const { name, args } = toolCall.functionCall;
          console.log(`Model wants to call function: ${name} with args:`, args);

          try {
            const content = await fetchUrlContent(args.url); // هنا fetchUrlContent هترمي error لو فشلت
            console.log(
              "Fetched content (truncated):",
              content.substring(0, 200) + "..."
            );

            currentResponse = await chat.sendMessage([
              {
                toolResponse: {
                  toolCallId: toolCall.id,
                  response: { content: content },
                },
              },
            ]);
            response = currentResponse.response; // Update response for next iteration/final text
          } catch (error) {
            // هنا الخطأ هيتم التقاطه بسبب الـ "throw error" في fetchUrlContent
            logger.error({ err: error }, "Error executing fetchUrlContent");

            currentResponse = await chat.sendMessage([
              {
                toolResponse: {
                  toolCallId: toolCall.id,
                  response: { error: error.message }, // أرسل الخطأ للموديل
                },
              },
            ]);
            response = currentResponse.response; // Update response to get AI's error handling text
          }
        } else {
          // If there's a tool call but it's not fetchUrlContent (e.g., googleSearch)
          // You'd need to handle that tool here similarly.
          // For now, if an unhandled tool is called, we'll break and use the current response.
          console.warn("Unhandled tool call:", toolCall);
          break; // Exit loop if we don't know how to handle this tool
        }
      }
      // After all tool calls (or if none), get the final text response
      finalResponseText = response.text();

      const newHistory = await chat.getHistory();
      if (newHistory.length > 20) {
        newHistory.splice(0, 2);
      }
      saveChatHistory(chatId, newHistory);

      await delay(500);
      await sock.sendMessage(chatId, { text: finalResponseText });
    } catch (error) {
      logger.error({ err: error }, `Error in !gemini command`);
      await delay(200);
      await sock.sendMessage(chatId, {
        text: "حدث خطأ أثناء التواصل مع الذكاء الاصطناعي.",
      });
    }
  },
};
