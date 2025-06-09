// file: /commands/warn.js (Corrected Logic Flow)
const { getGroupSettings } = require("../../utils/storage.js"); // <-- 1. Import getGroupSettings
const {
  getUserWarnings,
  saveUserWarnings,
  clearUserWarnings,
} = require("../../utils/storage.js");
const logger = require("../../utils/logger.js");

module.exports = {
  name: "warn",
  description: "Warns a user and takes action if the limit is reached.",
  chat: "group",
  userAdminRequired: true,

  async execute(sock, msg, args) {
    try {
      const groupId = msg.key.remoteJid;
      const senderId = msg.key.participant;
      const mentionedJid =
        msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      const reason = args.slice(1).join(" ");

      // --- 1. Validate Inputs ---
      if (!mentionedJid) {
        return await sock.sendMessage(groupId, {
          text: "يجب عمل منشن للعضو الذي تريد تحذيره.",
        });
      }
      if (!reason) {
        return await sock.sendMessage(groupId, {
          text: "يجب كتابة سبب التحذير.",
        });
      }

      // --- 2. Add the New Warning ---
      const userWarnings = getUserWarnings(groupId, mentionedJid);
      userWarnings.push({
        reason: reason,
        by: senderId,
        date: new Date().toISOString(),
      });
      saveUserWarnings(groupId, mentionedJid, userWarnings);

      const newWarnCount = userWarnings.length;

      // --- 3. Send Confirmation & Check for Action ---
      let replyText =
        `✅ تم توجيه تحذير إلى @${mentionedJid.split("@")[0]}.\n` +
        `*السبب:* ${reason}`;

      await sock.sendMessage(groupId, {
        text: replyText,
        mentions: [mentionedJid],
      });

      const warnConfig = getGroupSettings(groupId)?.warn_system;

      if (
        warnConfig &&
        warnConfig.action === "KICK" &&
        newWarnCount >= warnConfig.max_warnings
      ) {
        await sock.sendMessage(groupId, {
          text: `🚫 لقد وصل العضو @${
            mentionedJid.split("@")[0]
          } إلى الحد الأقصى للتحذيرات (${newWarnCount}/${
            warnConfig.max_warnings
          }). سيتم حذفه.`,
          mentions: [mentionedJid],
        });

        try {
          // Kick the user and then clear their warnings
          await sock.groupParticipantsUpdate(groupId, [mentionedJid], "remove");
          clearUserWarnings(groupId, mentionedJid);
          logger.info(
            `[Warn Kick] Kicked and cleared warnings for ${mentionedJid} from ${groupId}`
          );
        } catch (kickError) {
          logger.error(
            { err: kickError },
            "Failed to kick user after max warnings"
          );
          await sock.sendMessage(groupId, {
            text: "حاولت حذف العضو ولكني لا أملك صلاحية كافية لذلك.",
          });
        }
      } else {
        // If no action is taken, just inform about the new count
        await sock.sendMessage(groupId, {
          text: `*إجمالي التحذيرات الآن:* ${newWarnCount}${
            warnConfig ? `/${warnConfig.max_warnings}` : ""
          }`,
        });
      }
    } catch (error) {
      logger.error({ err: error }, "An error occurred in the !warn command.");
      await sock.sendMessage(msg.key.remoteJid, {
        text: "حدث خطأ عام في أمر التحذير.",
      });
    }
  },
};
