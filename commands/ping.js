// file: /commands/ping.js

module.exports = {
  name: "ping",
  description: "A simple command to check if the bot is responsive.",
  chat: "all", // <-- الخاصية الجديدة. يمكن أن تكون 'group' أو 'private'

  async execute(sock, msg) {
    // The bot will reply with "Pong!"
    await sock.sendMessage(msg.key.remoteJid, { text: "Pong! 🏓" });
  },
};
