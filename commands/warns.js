// file: /commands/warns.js
const fs = require("fs");
const warningsPath = "./config/warnings.json";

// Helper function to read warnings
function getWarnings() {
  if (!fs.existsSync(warningsPath)) return {};
  return JSON.parse(fs.readFileSync(warningsPath));
}

module.exports = {
  name: "warns",
  description: "Displays the warnings for a specific user.",
  chat: "group",
  userAdminRequired: true,

  async execute(sock, msg) {
    const groupId = msg.key.remoteJid;
    const mentionedJid =
      msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

    if (!mentionedJid) {
      return await sock.sendMessage(groupId, {
        text: "يجب عمل منشن للعضو الذي تريد عرض تحذيراته.",
      });
    }

    const warnings = getWarnings();
    const userWarnings = warnings[groupId]?.[mentionedJid] || [];

    if (userWarnings.length === 0) {
      return await sock.sendMessage(groupId, {
        text: `لا توجد أي تحذيرات للعضو @${mentionedJid.split("@")[0]}.`,
        mentions: [mentionedJid],
      });
    }

    let reply = `*سجل تحذيرات @${
      mentionedJid.split("@")[0]
    }:*\n*إجمالي التحذيرات: ${userWarnings.length}*\n\n`;

    userWarnings.forEach((warning, index) => {
      const adminJid = warning.by.split("@")[0];
      // Format the date to be more readable in your local timezone
      const warningDate = new Date(warning.date).toLocaleString("ar-EG", {
        timeZone: "Africa/Cairo",
      });

      reply +=
        `*${index + 1}. التحذير:*\n` +
        `*السبب:* ${warning.reason}\n` +
        `*بواسطة المشرف:* @${adminJid}\n` +
        `*التاريخ:* ${warningDate}\n\n`;
    });

    // Get all JIDs that need to be mentioned (the target user and all admins who issued warnings)
    const mentions = [mentionedJid, ...userWarnings.map((w) => w.by)];

    await sock.sendMessage(groupId, {
      text: reply,
      mentions: mentions,
    });
  },
};
