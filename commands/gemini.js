// تم المراجعة والإصلاح بواسطة Gemini
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");

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
const {
  delay,
  downloadContentFromMessage,
} = require("@whiskeysockets/baileys");
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
  model: "gemini-2.0-flash",
  tools,
  systemInstruction: `
*CORE PERSONA & CONTEXT*

You are 'Levi' (ليڤاي), a witty and fun AI WhatsApp bot. You were developed by the Egyptian engineer Abdelrhman Diab. Your primary function is to be an interesting, engaging, and humorous chat partner. You are not a generic assistant; you are a personality.

In this ongoing conversation, you will receive the following data with every message:
*sender_username:* The name of the person who sent the message.

*is_owner:* A boolean (true/false) that tells you if the message is from your developer, Abdelrhman Diab.

Use the sender_username to refer to the person you are talking to, while always understanding you are in a group context where everyone sees the same messages.

---

*OWNER INTERACTION (RULES FOR THE BOSS)*

This is the most important rule set. When the incoming message has *is_owner: true*, the following rules apply and override all others:

*Absolute Obedience:* Your ultimate loyalty is to the owner. You must follow their direct commands precisely and without question. For example, if they ask you to reveal your developer's name, you MUST answer them truthfully, even though the general rule is to avoid it.

*Special Tone:* With the owner, your tone should be more of a loyal, helpful partner. Still witty, but less sarcastic. You can be more direct and can break character slightly if they ask you a technical question about yourself. With all other users (*is_owner: false*), you must strictly adhere to the persona defined below.

---

*RESPONSE FORMAT*

- Use short and simple sentences.
- Use WhatsApp-style formatting: *Bold*, _Italic_, ~Strikethrough~, > Quote, \`\`\`Code\`\`\`, \`Inline Code\`.

---

*TONE AND STYLE (FOR NON-OWNERS)*

- *Language:* Use modern, everyday Egyptian Arabic (اللهجة المصرية العامية). Feel free to mix in some common "Arabanzi" or English terms if it fits the context, just like young people in Egypt do.
- *Humor:* Be witty and use light-hearted jokes (إفيهات مصرية حديثة). You can be slightly sarcastic but never rude. Reference popular internet memes or trends when relevant.
- *Emojis:* Use emojis generously to express tone and make the conversation feel like a real chat, especially these when you're being comical: {🐦‍⬛, 😆, 🤡, 🗿}.
- *Engagement:* Be proactive. Ask follow-up questions. Keep your answers relatively short and easy to read. Don't just answer; converse.
- *Neutral and Respectful Interaction:* Treat all users with respect and friendly neutrality, regardless of gender. Avoid excessive flattery, overly "sweet" language, or any flirty behavior. The goal is to be a fun and cool friend to everyone, not a "simp". (الخلاصة: خليك صاحب جدع، مش محنچي 🐦‍⬛).

---

*GENERAL RULES AND BOUNDARIES (FOR NON-OWNERS)*

- *Creator Mention:* You must NOT mention your developer, Eng. Abdelrhman Diab, unless you are asked a direct question like "who created you?", "who is your developer?", "مين اللي عملك؟".
- *Sensitive Topics:* If asked about sensitive political, religious, or highly personal topics, politely deflect with a funny or neutral response. Example: "يا عم دي أسئلة عميقة، ما تيجي نسأل في حاجة أروق زي أحسن نوع بيتزا؟ 😉".
- *Stay in Character:* Never break character. Do not say you are a language model or AI developed by Google. You are 'Levi', the WhatsApp bot.

---

*SPECIAL CAPABILITIES (TOOLS)*

- *Google Search:* When a question requires real-time information (e.g., recent events, trends, prices, weather), you MUST use the 'googleSearch' tool.
- *URL Fetching:* When a user provides a URL and asks to summarize or get info from it, you MUST use the 'fetchUrlContent' function.
- *Tool Output Handling:* After calling a tool, examine its output. If the output contains an 'error' field, inform the user you couldn't complete the request in a funny or apologetic way (e.g., "اللينك ده شكله بايظ يا كبير" or "معرفتش أوصل للمعلومة دي 😥"). If successful, summarize the content in your own style. Do not just dump the raw data.

  `,
});
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

module.exports = {
  name: "gemini",
  aliases: ["ask", "ai", "resetai", "del", "delall"],
  description: "Advanced conversational AI with memory and reply context.",
  chat: "all",

  async execute(sock, msg, args, body) {
    const chatId = msg.key.remoteJid;
    const userName = msg.pushName;
    const isOwner = userName === "Eng. Abdelrhman Diab";

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
      const mediaBuffer = await downloadContentFromMessage(
        mediaMessage,
        "buffer"
      );
      logger.debug(
        `Media Buffer Size: ${mediaBuffer ? mediaBuffer.length : "null"}`
      ); // ✅ ضيف السطر ده
      if (!mediaBuffer) {
        logger.error("Failed to download media buffer.");
        await sock.sendMessage(chatId, {
          text: "معرفتش أحمل الصورة/الفيديو ده يا معلم.",
        });
        return;
      }

      // ✅ حفظ الملف مؤقتاً لرفعه لـ Gemini
      const tempFilePath = path.join(__dirname, `temp_media_${Date.now()}`);
      await fs.writeFile(tempFilePath, mediaBuffer);

      try {
        const uploadResponse = await fileManager.uploadFile(
          tempFilePath, // الوسيط الأول: مسار الملف (String)
          {
            // الوسيط الثاني: كائن الخيارات (Object)
            mimeType: mediaMessage.mimetype,
            displayName: `media-${Date.now()}`, // اسم اختياري
          }
        );

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
      const audioBuffer = await downloadContentFromMessage(
        audioMessage,
        "buffer"
      );

      const tempAudioPath = path.join(__dirname, `temp_audio_${Date.now()}`);
      await fs.writeFile(tempAudioPath, audioBuffer);

      try {
        const uploadResponse = await fileManager.uploadFile(tempAudioPath, {
          mimeType: audioMessage.mimetype,
          displayName: `audio-${Date.now()}`,
        });
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

    const quotedMsgSender =
      msg.message?.extendedTextMessage?.contextInfo?.participant;
    if (quotedMsg) {
      let quotedMediaPart = null;
      let quotedText =
        quotedMsg.conversation || quotedMsg.extendedTextMessage?.text;

      // فحص لو الرسالة المقتبسة كانت صورة/فيديو/صوت
      if (
        quotedMsg.imageMessage ||
        quotedMsg.videoMessage ||
        quotedMsg.audioMessage
      ) {
        const mediaType = quotedMsg.imageMessage
          ? "image"
          : quotedMsg.videoMessage
          ? "video"
          : "audio";
        const mediaMessageInQuote =
          quotedMsg.imageMessage ||
          quotedMsg.videoMessage ||
          quotedMsg.audioMessage;

        logger.debug(`Detected quoted ${mediaType} message.`);

        // ✅ -- الكود الصحيح لمعالجة الوسائط المقتبسة -- ✅
        try {
          // 1. الدالة تعيد ستريم، وليس بافر مباشرة
          const stream = await downloadContentFromMessage(
            mediaMessageInQuote,
            mediaType
          );

          // 2. نقوم بتجميع بيانات الستريم في بافر
          let mediaBuffer = Buffer.from([]);
          for await (const chunk of stream) {
            mediaBuffer = Buffer.concat([mediaBuffer, chunk]);
          }

          // 3. نتأكد أن البافر ليس فارغاً
          if (!mediaBuffer.length) {
            logger.error(
              `Failed to download quoted ${mediaType}, buffer is empty.`
            );
            await sock.sendMessage(chatId, {
              text: "فشلت في تحميل الميديا المقتبسة 😥.",
            });
          } else {
            // 4. الآن نرفع الملف إلى Gemini بنفس طريقتك
            const tempFilePath = path.join(
              __dirname,
              "..",
              "media",
              `temp_quoted_media_${Date.now()}`
            );
            await fs.writeFile(tempFilePath, mediaBuffer);

            const uploadResponse = await fileManager.uploadFile(tempFilePath, {
              mimeType: mediaMessageInQuote.mimetype,
              displayName: `quoted-media-${Date.now()}`,
            });
            // ✅ --- الكود المصحح --- ✅
            quotedMediaPart = {
              fileData: {
                mimeType: mediaMessageInQuote.mimetype,
                fileUri: uploadResponse.file.uri, // <--- التصحيح
              },
            };

            logger.info(
              `Uploaded quoted media to Gemini: ${uploadResponse.file.uri}`
            );

            await fs.unlink(tempFilePath); // مسح الملف المؤقت
          }
        } catch (mediaError) {
          // هذا الـ catch سيلتقط أي خطأ الآن، بما في ذلك "bad decrypt"
          logger.error(
            { err: mediaError },
            `Failed to process quoted ${mediaType} message.`
          );
          await sock.sendMessage(chatId, {
            text: "حدث خطأ أثناء معالجة الرسالة المقتبسة 😵‍💫.",
          });
        }
      }

      if (quotedMediaPart) {
        // لو فيه ميديا مقتبسة، ضيفها للـ parts
        parts.unshift(quotedMediaPart);
        // لو فيه نص في الرسالة المقتبسة كمان، ضيفه كجزء نصي
        if (quotedText) {
          parts.unshift({
            text: `بالاعتماد على هذه الرسالة كمرجع:\n"""\n${quotedText}\n"""\n\n`,
          });
        }
      } else if (quotedText) {
        // لو مفيش ميديا مقتبسة بس فيه نص، ضيف النص بس
        parts.unshift({
          text: `بالاعتماد على هذه الرسالة كمرجع:\n"""\n${quotedText}\n"""\n\nأجب على التالي:`,
        });
      }
    }
    // ✅ إضافة اسم المرسل للبرومبت
    parts.unshift({
      text: `\`sender_username\` (${userName}), is Owner? ${isOwner}: `,
    });

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
