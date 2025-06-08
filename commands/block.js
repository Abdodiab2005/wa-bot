// file: /commands/block.js (Upgraded with private chat context)
const logger = require("../utils/logger.js");
const config = require("../config/config.json");
const normalizeJid = require("../utils/normalizeJid.js");

module.exports = {
  name: "block",
  description: "Blocks a user from contacting the bot on WhatsApp.",
  chat: "all",

  async execute(sock, msg, args) {
    const remoteJid = msg.key.remoteJid;
    const isGroup = remoteJid.endsWith("@g.us");
    let targetJid;

    // --- NEW: Smart Target Identification ---
    // Case 1: The command is '!block' with no arguments in a private chat
    if (!isGroup && args.length === 0) {
      targetJid = remoteJid;
    }
    // Case 2: A target is specified (mention, reply, or number)
    else {
      const mentionedJid =
        msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      const repliedToJid =
        msg.message?.extendedTextMessage?.contextInfo?.participant;
      const numberArg = args[0];

      if (mentionedJid) {
        targetJid = mentionedJid;
      } else if (repliedToJid) {
        targetJid = repliedToJid;
      } else if (numberArg) {
        targetJid = `${numberArg.replace(/\D/g, "")}@s.whatsapp.net`;
      } else {
        return await sock.sendMessage(remoteJid, {
          text: "لكي يعمل هذا الأمر، استخدمه في شات خاص بدون وسائط، أو قم بعمل منشن/رد/كتابة رقم المستخدم.",
        });
      }
    }

    const normalizedTargetJid = normalizeJid(targetJid);

    // Safety Check
    if (config.owners.includes(normalizedTargetJid)) {
      return await sock.sendMessage(remoteJid, {
        text: "لا يمكنك حظر مالك البوت.",
      });
    }

    try {
      // ✅ --- THE FIX IS HERE ---
      await sock.updateBlockStatus(normalizedTargetJid, "block");

      // const successMsg = `🚫 تم حظر @${
      //   normalizedTargetJid.split("@")[0]
      // } بنجاح.`;
      // await sock.sendMessage(remoteJid, {
      //   text: successMsg,
      //   mentions: [normalizedTargetJid],
      // });
    } catch (error) {
      logger.error({ err: error, command: "block" }, "Error in !block command");
      await sock.sendMessage(remoteJid, {
        text: "حدث خطأ أثناء محاولة حظر المستخدم.",
      });
    }
  },
};
