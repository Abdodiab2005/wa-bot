// file: /commands/rules.js
const fs = require("fs");
const settingsPath = "./config/group_settings.json";
const logger = require("../../utils/logger");

// Helper function to read settings
function getSettings() {
  if (!fs.existsSync(settingsPath)) return {};
  return JSON.parse(fs.readFileSync(settingsPath));
}

module.exports = {
  name: "rules",
  description: "Displays the group rules.",
  chat: "group",

  async execute(sock, msg) {
    const groupId = msg.key.remoteJid;

    try {
      const settings = getSettings();
      const rules = settings[groupId]?.rules;

      if (rules) {
        const reply = `*📜 قواعد جروب ${msg.pushName}:*\n\n${rules}`;
        await sock.sendMessage(groupId, { text: reply });
      } else {
        await sock.sendMessage(groupId, {
          text: "لم يتم تعيين أي قواعد لهذا الجروب حتى الآن. يمكن للمشرفين تعيينها باستخدام `!setrules`.",
        });
      }
    } catch (error) {
      logger.error("[Error] in !rules command:", error);
      await sock.sendMessage(groupId, { text: "حدث خطأ أثناء جلب القواعد." });
    }
  },
};
