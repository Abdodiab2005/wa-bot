// file: /commands/save.js
const { readJSON, writeJSON } = require("../utils/storage.js");
const notesPath = "./config/group_notes.json";

module.exports = {
  name: "save",
  description: "Saves a new note for the group.",
  chat: "all",

  async execute(sock, msg, args) {
    const groupId = msg.key.remoteJid;
    const keywordArg = args[0];
    const noteText = args.slice(1).join(" ");

    if (!keywordArg || !keywordArg.startsWith("#") || !noteText) {
      return await sock.sendMessage(groupId, {
        text: "صيغة غير صحيحة. استخدم:\n`!save #keyword نص الملاحظة`",
      });
    }

    const keyword = keywordArg.slice(1).toLowerCase(); // Remove '#' and convert to lowercase
    const notes = readJSON(notesPath);

    if (!notes[groupId]) {
      notes[groupId] = {};
    }

    notes[groupId][keyword] = noteText;
    writeJSON(notesPath, notes);

    await sock.sendMessage(groupId, {
      text: `✅ تم حفظ الملاحظة بنجاح بالكلمة المفتاحية: \`#${keyword}\``,
    });
  },
};
