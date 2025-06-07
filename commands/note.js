// file: /commands/note.js
const { readJSON } = require("../utils/storage.js");
const notesPath = "./config/group_notes.json";

module.exports = {
  name: "note",
  description: "Retrieves a saved note.",
  chat: "all",

  async execute(sock, msg, args) {
    const groupId = msg.key.remoteJid;
    const keywordArg = args[0];

    if (!keywordArg || !keywordArg.startsWith("#")) {
      return await sock.sendMessage(groupId, {
        text: "صيغة غير صحيحة. استخدم: `!note #keyword`",
      });
    }

    const keyword = keywordArg.slice(1).toLowerCase();
    const notes = readJSON(notesPath);
    const noteText = notes[groupId]?.[keyword];

    if (noteText) {
      await sock.sendMessage(groupId, { text: noteText });
    } else {
      await sock.sendMessage(groupId, {
        text: `⚠️ لم يتم العثور على ملاحظة بالكلمة المفتاحية: \`${keywordArg}\`\n\nلعرض كل الملاحظات، استخدم: \`!notes\``,
      });
    }
  },
};
