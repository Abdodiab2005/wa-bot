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
// const axios = require("axios"); // لم نعد نستخدم axios مباشرة هنا، fetch كفاية
const { delay } = require("@whiskeysockets/baileys");
const fs = require("fs").promises; // ✅ لإضافة التعامل مع الملفات
const path = require("path"); // ✅ لإضافة التعامل مع المسارات

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  logger.error("GEMINI_API_KEY is not defined!");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);

// ✅ تعريف الـ tools بشكل صحيح (لكل أداة أوبجيكت منفصل)
const tools = [
  {
    googleSearch: {}, // أوبجيكت مستقل لـ Google Search
  },
  // {
  //   functionDeclarations: [
  //     {
  //       name: "fetchUrlContent",
  //       description:
  //         "Fetches the content of a given URL. Use this when a user provides a link and asks for a summary or information from it. It can fetch text content like HTML or JSON.",
  //       parameters: {
  //         type: "OBJECT",
  //         properties: {
  //           url: {
  //             type: "STRING",
  //             description: "The full URL to fetch content from.",
  //           },
  //         },
  //         required: ["url"],
  //       },
  //     },
  //   ],
  // },
];

// ✅ إصلاح دالة fetchUrlContent لتلقت الأخطاء بشكل صحيح
async function fetchUrlContent(url) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      const errorMessage = `HTTP error! Status: ${response.status} from ${url}`;
      logger.error({ status: response.status, url: url }, errorMessage);
      throw new Error(errorMessage);
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
      logger.warn({ contentType: contentType, url: url }, warningMessage);
      return await response.text();
    }
  } catch (error) {
    logger.error(
      { err: error, url: url },
      `Failed to fetch content from ${url}: ${error.message}`
    );
    throw error;
  }
}

// ✅ الموديل الآن هو gemini-1.5-flash لضمان دعم الـ tools
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash-latest",
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

module.exports = {
  name: "gemini",
  aliases: ["ask", "ai", "resetai", "del", "delall"],
  description: "Advanced conversational AI with memory and reply context.",
  chat: "all",

  async execute(sock, msg, args, body) {
    const chatId = msg.key.remoteJid;
    const userName = msg.pushName;
    console.log(`Sender name: ${userName}`);
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

    let prompt = args.join(" ");
    let parts = []; // ✅ لجمع الأجزاء المختلفة للرسالة (نص، صورة، صوت)

    // ✅ --- التعامل مع الصور والفيديوهات (Multimodal Input) ---
    if (msg.message?.imageMessage || msg.message?.videoMessage) {
      const mediaMessage = msg.message.imageMessage || msg.message.videoMessage;
      const mediaBuffer = await sock.downloadMediaMessage(
        mediaMessage,
        "buffer"
      );

      // ✅ حفظ الملف مؤقتاً لرفعه لـ Gemini
      const tempFilePath = path.join(__dirname, `temp_media_${Date.now()}`);
      await fs.writeFile(tempFilePath, mediaBuffer);

      try {
        const uploadResponse = await genAI.uploadFile(tempFilePath);
        parts.push({
          fileData: {
            mimeType: mediaMessage.mimetype,
            uri: uploadResponse.file.uri,
          },
        });
        logger.info(`Uploaded media to Gemini: ${uploadResponse.file.uri}`);

        // ✅ إضافة الكابشن كجزء نصي إذا وجد
        if (mediaMessage.caption) {
          prompt = mediaMessage.caption; // الكابشن هو البرومبت الأساسي
          parts.push({ text: prompt });
        } else if (prompt) {
          // لو في نص بس مفيش كابشن، نضيف النص
          parts.push({ text: prompt });
        } else {
          // لو لا كابشن ولا نص، نحط برومبت افتراضي
          parts.push({ text: "ماذا يوجد في هذه الصورة/الفيديو؟" });
        }
      } catch (uploadError) {
        logger.error({ err: uploadError }, "Failed to upload media to Gemini.");
        await sock.sendMessage(chatId, {
          text: "حصل مشكلة وأنا بحاول أشوف الصورة أو الفيديو ده 😔.",
        });
        await fs.unlink(tempFilePath); // مسح الملف المؤقت حتى لو فشل الرفع
        return;
      } finally {
        await fs.unlink(tempFilePath); // مسح الملف المؤقت
      }
    }
    // ✅ --- التعامل مع الفويس نوت (Audio Input) ---
    else if (msg.message?.audioMessage) {
      const audioMessage = msg.message.audioMessage;
      // ملاحظة: Baileys بينزل الفويس نوت كـ OGG/Opus عادة
      // Gemini بيدعم OGG/Opus/MP3. لو عندك مشاكل، ممكن تحتاج تحويل بـ ffmpeg
      const audioBuffer = await sock.downloadMediaMessage(
        audioMessage,
        "buffer"
      );

      const tempAudioPath = path.join(__dirname, `temp_audio_${Date.now()}`);
      await fs.writeFile(tempAudioPath, audioBuffer);

      try {
        const uploadResponse = await genAI.uploadFile(tempAudioPath);
        parts.push({
          fileData: {
            mimeType: audioMessage.mimetype, // غالبا 'audio/ogg; codecs=opus'
            uri: uploadResponse.file.uri,
          },
        });
        logger.info(`Uploaded audio to Gemini: ${uploadResponse.file.uri}`);

        // ✅ إضافة نص افتراضي لتوجيه Gemini لتحليل الصوت
        if (prompt) {
          parts.push({ text: prompt }); // لو فيه نص مع الفويس
        } else {
          parts.push({ text: "حلل لي هذا التسجيل الصوتي." });
        }
      } catch (uploadError) {
        logger.error({ err: uploadError }, "Failed to upload audio to Gemini.");
        await sock.sendMessage(chatId, {
          text: "فيه مشكلة وأنا بحاول أسمع التسجيل الصوتي ده 😔.",
        });
        await fs.unlink(tempAudioPath); // مسح الملف المؤقت حتى لو فشل الرفع
        return;
      } finally {
        await fs.unlink(tempAudioPath); // مسح الملف المؤقت
      }
    }
    // ✅ --- التعامل مع الرسائل النصية فقط (لو مفيش صور أو فويس) ---
    else if (prompt) {
      parts.push({ text: prompt });
    }

    // ✅ لو مفيش أي نوع محتوى، نطلع رسالة خطأ
    if (parts.length === 0) {
      return await sock.sendMessage(chatId, {
        text: "يرجى كتابة سؤال أو إرسال صورة/فيديو/تسجيل صوتي مع الأمر.",
      });
    }

    // Check for reply context (ده هيندمج مع الـ parts)
    const quotedMsg =
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quotedMsg) {
      const quotedText =
        quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;
      if (quotedText) {
        // ✅ إضافة الرسالة المقتبسة كجزء نصي في البداية
        parts.unshift({
          text: `بالاعتماد على هذه الرسالة كمرجع:\n"""\n${quotedText}\n"""\n\nأجب على التالي:`,
        });
      }
    }
    // ✅ إضافة اسم المرسل للبرومبت
    parts.unshift({ text: `\`sender_username\` (${userName}): ` });

    if (!API_KEY)
      return await sock.sendMessage(chatId, {
        text: "خطأ في الإعدادات: مفتاح Gemini API غير معرف.",
      });

    try {
      await delay(500);
      await sock.sendMessage(chatId, { text: "🤖 أفكر..." });

      const history = getChatHistory(chatId);
      const chat = model.startChat({ history: history });

      // ✅ هنا هنستخدم parts بدلاً من prompt كـ string
      const result = await chat.sendMessage(parts); // ✅ تغيير هنا
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
            const content = await fetchUrlContent(args.url);
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
            response = currentResponse.response;
          } catch (error) {
            logger.error({ err: error }, "Error executing fetchUrlContent");

            currentResponse = await chat.sendMessage([
              {
                toolResponse: {
                  toolCallId: toolCall.id,
                  response: { error: error.message },
                },
              },
            ]);
            response = currentResponse.response;
          }
        }
        // ✅ إضافة التعامل مع googleSearch لو الموديل طلبها
        else if (
          toolCall.functionCall &&
          toolCall.functionCall.name === "googleSearch"
        ) {
          const { name, args } = toolCall.functionCall;
          console.log(`Model wants to call function: ${name} with args:`, args);

          try {
            // Note: Google Search tool doesn't require explicit arguments from your side.
            // It uses the context of the prompt to perform the search.
            // We just need to respond with an empty toolResponse for it to work with the SDK
            // The AI will interpret the search results automatically
            currentResponse = await chat.sendMessage([
              {
                toolResponse: {
                  toolCallId: toolCall.id,
                  response: { success: true }, // فقط لإخبار الموديل أن الأداة تم استدعاؤها
                },
              },
            ]);
            response = currentResponse.response;
          } catch (error) {
            logger.error({ err: error }, "Error executing googleSearch tool");
            currentResponse = await chat.sendMessage([
              {
                toolResponse: {
                  toolCallId: toolCall.id,
                  response: { error: error.message },
                },
              },
            ]);
            response = currentResponse.response;
          }
        } else {
          console.warn("Unhandled tool call:", toolCall);
          break;
        }
      }
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
