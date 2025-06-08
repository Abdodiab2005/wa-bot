// file: /commands/blacklist.js (Corrected Logic)
const { getGroupSettings, saveGroupSettings } = require("../utils/storage.js");
const logger = require("../utils/logger");
const normalizeJid = require("../utils/normalizeJid");

module.exports = {
  name: "blacklist",
  aliases: ["unblacklist", "block", "unblock"], // We keep aliases here for a reason
  description: "Manages the group's user blacklist.",
  chat: "group",
  userAdminRequired: true,

  async execute(sock, msg, args, body, groupMetadata) {
    const groupId = msg.key.remoteJid;
    const command = body.slice(1).trim().split(/ +/)[0].toLowerCase();

    // --- New, smarter action parser ---
    let action;
    // Explicit sub-command like !blacklist list
    if (args[0] && ["add", "remove", "list"].includes(args[0].toLowerCase())) {
      action = args[0].toLowerCase();
      args.shift(); // Remove the action from args, so the rest are the target
    }
    // Action inferred from alias like !block or !unblock
    else if (["blacklist", "block"].includes(command)) {
      action = "add";
    } else if (["unblacklist", "unblock"].includes(command)) {
      action = "remove";
    } else {
      action = "list"; // Default action is to list
    }

    try {
      const settings = getGroupSettings(groupId);
      if (!settings.blacklist) settings.blacklist = [];

      // For list action, no target is needed
      if (action === "list") {
        if (settings.blacklist.length === 0)
          return await sock.sendMessage(groupId, {
            text: "القائمة السوداء فارغة حاليًا.",
          });

        let listReply = "*🚫 قائمة المستخدمين المحظورين من البوت:*\n\n";
        settings.blacklist.forEach((jid) => {
          listReply += `» @${jid.split("@")[0]}\n`;
        });
        return await sock.sendMessage(groupId, {
          text: listReply,
          mentions: settings.blacklist,
        });
      }

      // For add/remove actions, a target is required
      const targetJid =
        msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
        (args[0] ? `${args[0].replace(/\D/g, "")}@s.whatsapp.net` : null);

      if (!targetJid)
        return await sock.sendMessage(groupId, {
          text: `لتنفيذ هذا الإجراء، قم بعمل منشن للعضو أو كتابة رقمه.`,
        });

      const normalizedTargetJid = normalizeJid(targetJid);

      if (action === "add") {
        const targetUser = groupMetadata.participants.find(
          (p) => p.id === normalizedTargetJid
        );
        if (targetUser?.admin)
          return await sock.sendMessage(groupId, {
            text: "لا يمكن حظر المشرفين.",
          });
        if (settings.blacklist.includes(normalizedTargetJid))
          return await sock.sendMessage(groupId, {
            text: `العضو @${normalizedTargetJid.split("@")[0]} محظور بالفعل.`,
            mentions: [normalizedTargetJid],
          });

        settings.blacklist.push(normalizedTargetJid);
        await sock.sendMessage(groupId, {
          text: `🚫 تم إضافة @${
            normalizedTargetJid.split("@")[0]
          } إلى القائمة السوداء بنجاح.`,
          mentions: [normalizedTargetJid],
        });
      } else if (action === "remove") {
        if (!settings.blacklist.includes(normalizedTargetJid))
          return await sock.sendMessage(groupId, {
            text: `العضو @${
              normalizedTargetJid.split("@")[0]
            } ليس في القائمة السوداء أصلاً.`,
            mentions: [normalizedTargetJid],
          });

        settings.blacklist = settings.blacklist.filter(
          (jid) => jid !== normalizedTargetJid
        );
        await sock.sendMessage(groupId, {
          text: `✅ تم إزالة @${
            normalizedTargetJid.split("@")[0]
          } من القائمة السوداء.`,
          mentions: [normalizedTargetJid],
        });
      }

      saveGroupSettings(groupId, settings);
    } catch (error) {
      logger.error(
        { err: error, command: "blacklist" },
        "Error in !blacklist command"
      );
    }
  },
};
