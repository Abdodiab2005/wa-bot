// file: /commands/deletenote.js
const { readJSON, writeJSON } = require("../utils/storage.js");
const notesPath = "./config/group_notes.json";

module.exports = {
  name: "deletenote",
  description: "Deletes a saved note.",
  chat: "all",
  userAdminRequired: true,

  async execute(sock, msg, args) {
    const groupId = msg.key.remoteJid;
    const keywordArg = args[0];

    if (!keywordArg || !keywordArg.startsWith("#")) {
      return await sock.sendMessage(groupId, {
        text: "صيغة غير صحيحة. استخدم: `!deletenote #keyword`",
      });
    }

    const keyword = keywordArg.slice(1).toLowerCase();
    const notes = readJSON(notesPath);

    if (notes[groupId]?.[keyword]) {
      delete notes[groupId][keyword];
      writeJSON(notesPath, notes);
      await sock.sendMessage(groupId, {
        text: `☑️ تم حذف الملاحظة \`#${keyword}\` بنجاح.`,
      });
    } else {
      await sock.sendMessage(groupId, {
        text: `⚠️ لم يتم العثور على ملاحظة بالكلمة المفتاحية: \`${keywordArg}\``,
      });
    }
  },
};
