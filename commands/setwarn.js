// file: /commands/setwarn.js
const { readJSON, writeJSON } = require("../utils/storage.js");
const settingsPath = "./config/group_settings.json";

module.exports = {
  name: "setwarn",
  description: "Configures the automatic warning system.",
  chat: "group",
  userAdminRequired: true,

  async execute(sock, msg, args) {
    const groupId = msg.key.remoteJid;
    const subCommand = args[0]?.toLowerCase();
    const value = args[1];

    const settings = readJSON(settingsPath);
    if (!settings[groupId]) settings[groupId] = {};
    if (!settings[groupId].warn_system)
      settings[groupId].warn_system = { max_warnings: 3, action: "NONE" };

    const warnConfig = settings[groupId].warn_system;

    switch (subCommand) {
      case "max":
        const max = parseInt(value, 10);
        if (isNaN(max) || max < 1) {
          return await sock.sendMessage(groupId, {
            text: "يرجى تحديد عدد صحيح وصالح للحد الأقصى للتحذيرات.",
          });
        }
        warnConfig.max_warnings = max;
        await sock.sendMessage(groupId, {
          text: `✅ تم تعيين الحد الأقصى للتحذيرات إلى ${max}.`,
        });
        break;

      case "action":
        const action = value?.toUpperCase();
        if (action !== "KICK" && action !== "NONE") {
          return await sock.sendMessage(groupId, {
            text: "الإجراء غير صالح. الإجراءات المتاحة: `KICK`, `NONE`",
          });
        }
        warnConfig.action = action;
        await sock.sendMessage(groupId, {
          text: `✅ تم تعيين الإجراء التلقائي إلى ${action}.`,
        });
        break;

      default:
        return await sock.sendMessage(groupId, {
          text: "صيغة غير صحيحة. استخدم:\n`!setwarn max <number>`\n`!setwarn action <KICK|NONE>`",
        });
    }

    writeJSON(settingsPath, settings);
  },
};
