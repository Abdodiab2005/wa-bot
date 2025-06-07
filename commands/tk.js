// file: /commands/tiktok.js (or tk.js) - Final Scraper API Version
const axios = require("axios");
const logger = require("../utils/logger.js");

// This API endpoint wraps around TikTok's logic and provides a clean response.
const API_ENDPOINT = "https://api.tikmate.app/api/lookup";

async function fetchFromScraper(url) {
  try {
    const response = await axios.post(
      API_ENDPOINT,
      `url=${encodeURIComponent(url)}`,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36",
        },
      }
    );
    // Check for success and return the data object
    if (response.data.success) {
      return response.data;
    }
    return null;
  } catch (error) {
    logger.error(
      { err: error.response?.data || error.message },
      "Error fetching from TikMate API"
    );
    return null;
  }
}

module.exports = {
  name: "tk", // or "tk"
  description:
    "Fetches info or downloads media from a TikTok link using a scraper API.",
  chat: "all",

  async execute(sock, msg, args) {
    let subCommand = "video"; // Default action
    let url = args[0];

    const potentialSubCommands = ["info", "audio", "video"];
    if (
      args.length > 1 &&
      potentialSubCommands.includes(args[0].toLowerCase())
    ) {
      subCommand = args[0].toLowerCase();
      url = args[1];
    }

    if (!url || !url.includes("tiktok.com")) {
      return await sock.sendMessage(msg.key.remoteJid, {
        text: "يرجى إرسال رابط تيك توك صالح.",
      });
    }

    await sock.sendMessage(msg.key.remoteJid, {
      text: `🔍 جاري معالجة الرابط عبر الخدمة الوسيطة...`,
    });
    const data = await fetchFromScraper(url);

    if (!data) {
      return await sock.sendMessage(msg.key.remoteJid, {
        text: "عذرًا، فشلت في جلب البيانات من الخدمة الوسيطة. قد يكون الرابط غير صالح أو الخدمة عليها ضغط.",
      });
    }

    try {
      switch (subCommand) {
        case "audio":
          await sock.sendMessage(msg.key.remoteJid, {
            text: "🎧 جاري إرسال الصوت...",
          });
          await sock.sendMessage(msg.key.remoteJid, {
            audio: {
              url: `https://tikmate.app/download/${data.token}/${data.id}.mp3?hd=1`,
            },
            mimetype: "audio/mp4",
          });
          break;

        case "info":
          const infoReply =
            `*🎵 تفاصيل الفيديو 🎵*\n\n` +
            `*👤 الناشر:* ${data.author_name} (@${data.author_id})\n` +
            `*❤️ اللايكات:* ${data.like_count.toLocaleString()}`;
          await sock.sendMessage(msg.key.remoteJid, { text: infoReply });
          break;

        case "video":
        default:
          await sock.sendMessage(msg.key.remoteJid, {
            text: "🎬 جاري إرسال الفيديو (بدون علامة مائية)...",
          });
          await sock.sendMessage(msg.key.remoteJid, {
            video: {
              url: `https://tikmate.app/download/${data.token}/${data.id}.mp4?hd=1`,
            },
            caption: data.title || "Downloaded via Bot",
          });
          break;
      }
    } catch (error) {
      logger.error({ err: error }, "Error sending TikTok media");
      await sock.sendMessage(msg.key.remoteJid, {
        text: "حدث خطأ أثناء إرسال الملف. قد يكون حجمه كبيرًا جدًا.",
      });
    }
  },
};
