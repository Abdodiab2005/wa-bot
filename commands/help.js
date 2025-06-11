// file: /commands/notes.js
const commands = require("../config/config.json");
const logger = require("../utils/logger.js");

module.exports = {
  name: "help",
  description: "Lists all available commands.",
  chat: "all",

  async execute(sock, msg) {
    try {
      const commandsList = Array.from(commands).join("\n");
      await sock.sendMessage(msg.key.remoteJid, {
        text: `Here are the available commands:\n\n${commandsList}`,
      });
    } catch (error) {
      logger.error("Error in !help command:", error);
      await sock.sendMessage(msg.key.remoteJid, { text: "حدث خطأ." });
    }
  },
};
