// file: /commands/status.js

// 'os' is a built-in Node.js module to get operating system information
const os = require("os");
// We can require the package.json of baileys to get its version
const baileysVersion = require("@whiskeysockets/baileys/package.json").version;
const logger = require("../utils/logger");

/**
 * A helper function to format seconds into a human-readable string.
 * e.g., 86461 seconds -> "1 day, 0 hours, 1 minute, 1 second"
 * @param {number} seconds - The total seconds to format.
 * @returns {string} The formatted uptime string.
 */
function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  return `${d} يوم, ${h} ساعة, ${m} دقيقة, ${s} ثانية`;
}

module.exports = {
  name: "status",
  description: "Displays the bot's system status.",
  chat: "all", // Can be used in any chat

  async execute(sock, msg) {
    try {
      // --- GATHERING DATA ---

      // 1. Uptime
      const uptimeSeconds = process.uptime();
      const formattedUptime = formatUptime(uptimeSeconds);

      // 2. RAM Usage
      // process.memoryUsage().rss is the Resident Set Size in bytes
      const rssBytes = process.memoryUsage().rss;
      const rssMb = (rssBytes / 1024 / 1024).toFixed(2); // Convert to MB

      // 3. Node.js Version
      const nodeVersion = process.version;

      // 4. Operating System Info
      const platform = os.platform();
      const osRelease = os.release();

      // --- BUILDING THE REPLY ---
      const reply = `*🤖 Bot Status 🤖*

*⏰ وقت التشغيل:* ${formattedUptime}
* 📊 استخدام الذاكرة:* ${rssMb} MB
*🟢 Node.js Version:* ${nodeVersion}
*📚 Baileys Version:* v${baileysVersion}
*💻 نظام التشغيل:* ${platform}
*💿 إصدار نظام التشغيل:* ${osRelease}`;

      await sock.sendMessage(msg.key.remoteJid, { text: reply });
    } catch (error) {
      logger.error("[Error] في أمر !status:", error);
      await sock.sendMessage(msg.key.remoteJid, {
        text: "حدث خطأ أثناء جلب حالة النظام.",
      });
    }
  },
};
