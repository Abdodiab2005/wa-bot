// file: /commands/warn.js
const { readJSON, writeJSON } = require("../utils/storage.js");
const logger = require("../utils/logger");

const warningsPath = "./config/warnings.json";
const settingsPath = "./config/group_settings.json";

module.exports = {
  name: "warn",
  description: "Warns a user in the group.",
  chat: "group",
  userAdminRequired: true,

  async execute(sock, msg, args) {
    const groupId = msg.key.remoteJid;
    const senderId = msg.key.participant;

    // 1. Get the mentioned user's JID
    const mentionedJid =
      msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    if (!mentionedJid) {
      return await sock.sendMessage(groupId, {
        text: "يجب عمل منشن للعضو الذي تريد تحذيره.\n\n*مثال:*\n`!warn @user سبب التحذير`",
      });
    }

    const settings = readJSON(settingsPath);
    const warnConfig = settings[groupId]?.warn_system;

    if (
      warnConfig &&
      warnConfig.action === "KICK" &&
      warnCount >= warnConfig.max_warnings
    ) {
      await sock.sendMessage(groupId, {
        text: `🚫 لقد وصل العضو @${
          mentionedJid.split("@")[0]
        } إلى الحد الأقصى للتحذيرات (${warnCount}/${
          warnConfig.max_warnings
        }). سيتم حذفه.`,
        mentions: [mentionedJid],
      });

      // Kick the user
      try {
        await sock.groupParticipantsUpdate(groupId, [mentionedJid], "remove");

        // Optionally, clear the user's warnings after kicking them
        delete warnings[groupId][mentionedJid];
        writeJSON(warningsPath, warnings);
        logger.info(
          `[Warn Kick] Kicked and cleared warnings for ${mentionedJid} from ${groupId}`
        );
      } catch (error) {
        logger.error("[Error] Failed to kick user after max warnings:", error);
        await sock.sendMessage(groupId, {
          text: "حاولت حذف العضو ولكني لا أملك صلاحية كافية لذلك.",
        });
      }
    } else {
      // If no action is taken, just inform about the current count
      await sock.sendMessage(groupId, {
        text: `*إجمالي التحذيرات الآن:* ${warnCount}${
          warnConfig ? `/${warnConfig.max_warnings}` : ""
        }`,
      });
    }

    // 2. Get the reason for the warning
    const reason = args.slice(1).join(" ");
    if (!reason) {
      return await sock.sendMessage(groupId, {
        text: "يجب كتابة سبب التحذير.",
      });
    }

    const warnings = readJSON(warningsPath);

    // Initialize data structures if they don't exist
    if (!warnings[groupId]) warnings[groupId] = {};
    if (!warnings[groupId][mentionedJid]) warnings[groupId][mentionedJid] = [];

    // 3. Add the new warning object
    warnings[groupId][mentionedJid].push({
      reason: reason,
      by: senderId,
      date: new Date().toISOString(),
    });

    writeJSON(warningsPath, warnings);

    // 4. Send confirmation message
    const warnCount = warnings[groupId][mentionedJid].length;
    const replyText =
      `✅ تم توجيه تحذير إلى @${mentionedJid.split("@")[0]}.\n` +
      `*السبب:* ${reason}\n` +
      `*إجمالي التحذيرات:* ${warnCount}`;

    await sock.sendMessage(groupId, {
      text: replyText,
      mentions: [mentionedJid],
    });
  },
};
