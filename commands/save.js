// file: /commands/save.js (Refactored for SQLite)
const { saveNote } = require("../utils/storage.js");
const logger = require("../utils/logger");

module.exports = {
  name: "save",
  description: "Saves a new note for the group.",
  chat: "group",
  userAdminRequired: true,

  async execute(sock, msg, args) {
    const groupId = msg.key.remoteJid;
    const keywordArg = args[0];
    const noteText = args.slice(1).join(" ");

    if (!keywordArg || !keywordArg.startsWith("#") || !noteText) {
      return await sock.sendMessage(groupId, {
        text: "صيغة غير صحيحة. استخدم:\n`!save #keyword نص الملاحظة`",
      });
    }

    const keyword = keywordArg.slice(1).toLowerCase();

    try {
      // Simply call the new storage function
      saveNote(groupId, keyword, noteText);
      await sock.sendMessage(groupId, {
        text: `✅ تم حفظ الملاحظة بنجاح بالكلمة المفتاحية: \`#${keyword}\``,
      });
    } catch (error) {
      logger.error({ err: error, command: "save" }, "Error in !save command");
      await sock.sendMessage(groupId, { text: "حدث خطأ أثناء حفظ الملاحظة." });
    }
  },
};
