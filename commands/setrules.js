// file: /commands/setrules.js
const fs = require("fs");
const settingsPath = "./config/group_settings.json";
const logger = require("../utils/logger");

// Helper function to read settings
function getSettings() {
  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, JSON.stringify({}));
  }
  return JSON.parse(fs.readFileSync(settingsPath));
}

// Helper function to write settings
function saveSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

module.exports = {
  name: "setrules",
  description: "Sets the rules for the current group.",
  chat: "group",
  userAdminRequired: true, // Only admins can set rules

  async execute(sock, msg, args) {
    const groupId = msg.key.remoteJid;

    // The entire text after the command is considered the rules
    const rulesText = args.join(" ");

    if (!rulesText) {
      return await sock.sendMessage(groupId, {
        text: "يرجى كتابة القواعد بعد الأمر.\n*مثال:*\n`!setrules 1. احترام الأعضاء.\n2. ممنوع السبام.`",
      });
    }

    try {
      const settings = getSettings();

      // Initialize settings for the group if it doesn't exist
      if (!settings[groupId]) {
        settings[groupId] = {};
      }

      // Set the rules
      settings[groupId].rules = rulesText;

      saveSettings(settings);

      await sock.sendMessage(groupId, {
        text: "✅ تم حفظ قواعد الجروب بنجاح.",
      });
    } catch (error) {
      logger.error("[Error] in !setrules command:", error);
      await sock.sendMessage(groupId, { text: "حدث خطأ أثناء حفظ القواعد." });
    }
  },
};
