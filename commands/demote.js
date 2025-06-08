// file: /commands/demote.js
const logger = require("../utils/logger.js");

module.exports = {
  name: "demote",
  description: "Demotes an admin to a regular member.",
  chat: "group",
  userAdminRequired: true,
  botAdminRequired: true,

  async execute(sock, msg, args, body, groupMetadata) {
    const groupId = msg.key.remoteJid;

    // Logic to identify the target user from mention or reply
    const targetJid =
      msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
      msg.message?.extendedTextMessage?.contextInfo?.participant;

    if (!targetJid) {
      return await sock.sendMessage(groupId, {
        text: "يجب عمل منشن للمشرف أو الرد على رسالته لعزله.",
      });
    }

    // Safety check: Is the target user NOT an admin?
    const targetUser = groupMetadata.participants.find(
      (p) => p.id === targetJid
    );
    if (!targetUser || !targetUser.admin) {
      return await sock.sendMessage(groupId, {
        text: `⚠️ العضو @${targetJid.split("@")[0]} ليس مشرفًا أصلاً.`,
        mentions: [targetJid],
      });
    }

    // Safety check: Cannot demote the group creator
    if (targetUser.admin === "superadmin") {
      return await sock.sendMessage(groupId, {
        text: "لا يمكن عزل منشئ الجروب.",
      });
    }

    try {
      await sock.groupParticipantsUpdate(
        groupId,
        [targetJid],
        "demote" // The action is 'demote'
      );
      await sock.sendMessage(groupId, {
        text: `👤 تم عزل @${targetJid.split("@")[0]} من الإشراف.`,
        mentions: [targetJid],
      });
    } catch (error) {
      logger.error(
        { err: error, command: "demote" },
        "Error in !demote command"
      );
      await sock.sendMessage(groupId, { text: "حدث خطأ أثناء محاولة العزل." });
    }
  },
};
