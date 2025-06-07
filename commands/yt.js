// file: /commands/yt.js (The new unified version)
const axios = require("axios");
const ytdl = require("@distube/ytdl-core");
const logger = require("../utils/logger.js");

const API_KEY = process.env.YOUTUBE_API_KEY;

// --- Helper Functions for each sub-command ---

async function handleInfo(sock, msg, url) {
  if (!API_KEY)
    return await sock.sendMessage(msg.key.remoteJid, {
      text: "خطأ: مفتاح YouTube API غير معرف.",
    });

  const videoIdRegex =
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(videoIdRegex);
  if (!match || !match[1])
    return await sock.sendMessage(msg.key.remoteJid, {
      text: "لم أتمكن من استخلاص ID الفيديو من هذا الرابط.",
    });

  const videoId = match[1];
  const API_URL = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${API_KEY}`;

  try {
    await sock.sendMessage(msg.key.remoteJid, {
      text: "🔍 جاري جلب بيانات الفيديو...",
    });
    const response = await axios.get(API_URL);
    if (!response.data.items?.length)
      return await sock.sendMessage(msg.key.remoteJid, {
        text: "لم يتم العثور على فيديو بهذا الـ ID.",
      });

    const video = response.data.items[0];
    const reply =
      `*🎬 تفاصيل فيديو يوتيوب 🎬*\n\n` +
      `*ር العنوان:* ${video.snippet.title}\n` +
      `*📺 القناة:* ${video.snippet.channelTitle}\n` +
      `*👀 المشاهدات:* ${Number(
        video.statistics.viewCount
      ).toLocaleString()}\n` +
      `*👍 اللايكات:* ${Number(
        video.statistics.likeCount
      ).toLocaleString()}\n` +
      `*⏰ المدة:* ${parseDuration(video.contentDetails.duration)}`;
    await sock.sendMessage(msg.key.remoteJid, { text: reply });
  } catch (error) {
    logger.error(
      { err: error.response?.data || error },
      "Error fetching YouTube data"
    );
    await sock.sendMessage(msg.key.remoteJid, {
      text: `حدث خطأ أثناء الاتصال بـ API يوتيوب.`,
    });
  }
}

async function handleAudio(sock, msg, url) {
  try {
    await sock.sendMessage(msg.key.remoteJid, {
      text: "🎧 جاري تجهيز الملف الصوتي...",
    });
    const info = await ytdl.getInfo(url);
    const duration = parseInt(info.videoDetails.lengthSeconds, 10);

    const audioStream = ytdl(url, {
      filter: "audioonly",
      quality: "highestaudio",
    });
    await sock.sendMessage(msg.key.remoteJid, {
      audio: { stream: audioStream },
      mimetype: "audio/mp4",
    });
  } catch (error) {
    logger.error({ err: error }, "Error in !yt audio command");
    await sock.sendMessage(msg.key.remoteJid, {
      text: "عذرًا، حدث خطأ أثناء تنزيل الملف الصوتي.",
    });
  }
}

async function handleVideo(sock, msg, url) {
  try {
    await sock.sendMessage(msg.key.remoteJid, {
      text: "🎬 جاري تجهيز الفيديو...",
    });
    const info = await ytdl.getInfo(url);
    const duration = parseInt(info.videoDetails.lengthSeconds, 10);

    const videoStream = ytdl(url, {
      quality: "lowest",
      filter: "videoandaudio",
    });
    await sock.sendMessage(msg.key.remoteJid, {
      video: { stream: videoStream },
      mimetype: "video/mp4",
      caption: info.videoDetails.title,
    });
  } catch (error) {
    logger.error({ err: error }, "Error in !yt video command");
    await sock.sendMessage(msg.key.remoteJid, {
      text: "عذرًا، حدث خطأ أثناء تنزيل الفيديو.",
    });
  }
}

// Helper function to parse duration
function parseDuration(duration) {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return "00:00:00";
  match.shift();
  const [hours, minutes, seconds] = match.map((part) =>
    parseInt(part?.replace(/\D/, "") || 0)
  );
  const pad = (num) => num.toString().padStart(2, "0");
  // We will only show hours if they exist
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

// --- Main Command Execution ---
module.exports = {
  name: "yt",
  description: "Fetches info, or downloads audio/video from a YouTube link.",
  chat: "all",

  async execute(sock, msg, args) {
    // Determine the subcommand and the URL
    let subCommand = "info"; // Default action
    let url;

    const potentialSubCommands = ["info", "audio", "video"];
    if (
      args.length > 1 &&
      potentialSubCommands.includes(args[0].toLowerCase())
    ) {
      subCommand = args[0].toLowerCase();
      url = args[1];
    } else {
      url = args[0];
    }

    if (!url || !ytdl.validateURL(url)) {
      return await sock.sendMessage(msg.key.remoteJid, {
        text: "يرجى إرسال رابط يوتيوب صالح.\n\n*الاستخدام:*\n`!yt <link>`\n`!yt info <link>`\n`!yt audio <link>`\n`!yt video <link>`",
      });
    }

    // Call the appropriate handler based on the subcommand
    switch (subCommand) {
      case "audio":
        await handleAudio(sock, msg, url);
        break;
      case "video":
        await handleVideo(sock, msg, url);
        break;
      case "info":
      default:
        await handleInfo(sock, msg, url);
        break;
    }
  },
};
