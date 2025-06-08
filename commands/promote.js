// file: /commands/promote.js
const logger = require("../utils/logger.js");

module.exports = {
  name: "promote",
  description: "Promotes a member to an admin.",
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
        text: "يجب عمل منشن للعضو أو الرد على رسالته لترقيته.",
      });
    }

    // Safety check: Is the target user already an admin?
    const targetUser = groupMetadata.participants.find(
      (p) => p.id === targetJid
    );
    if (
      targetUser &&
      (targetUser.admin === "admin" || targetUser.admin === "superadmin")
    ) {
      return await sock.sendMessage(groupId, {
        text: `⚠️ العضو @${targetJid.split("@")[0]} مشرف بالفعل.`,
        mentions: [targetJid],
      });
    }

    try {
      await sock.groupParticipantsUpdate(
        groupId,
        [targetJid],
        "promote" // The action is 'promote'
      );
      await sock.sendMessage(groupId, {
        text: `👑 تم ترقية @${targetJid.split("@")[0]} إلى مشرف بنجاح.`,
        mentions: [targetJid],
      });
    } catch (error) {
      logger.error(
        { err: error, command: "promote" },
        "Error in !promote command"
      );
      await sock.sendMessage(groupId, {
        text: "حدث خطأ أثناء محاولة الترقية.",
      });
    }
  },
};
