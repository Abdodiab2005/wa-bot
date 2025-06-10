// In index.js, this can be a new global helper function
const normalizeJid = require("../utils/helper.js");

async function handleAntiSpam(sock, msg) {
  const groupId = msg.key.remoteJid;
  if (!groupId.endsWith("@g.us")) return; // Only in groups

  const senderId = normalizeJid(msg.key.participant);

  // Get settings from DB
  const settings = getGroupSettings(groupId);
  const spamConfig = settings?.antispam;

  if (!spamConfig || !spamConfig.enabled) return;

  // Admins and owners are immune
  const isOwner = config.owners.includes(senderId);
  const groupMetadata = await sock.groupMetadata(groupId);
  const isSenderAdmin = groupMetadata.participants.some(
    (p) => ["admin", "superadmin"].includes(p.admin) && p.id === senderId
  );

  if (isOwner || isSenderAdmin) return;

  // --- Spam Detection Logic ---
  const now = Date.now();
  if (!userMessageTimestamps.has(senderId)) {
    userMessageTimestamps.set(senderId, []);
  }

  const userTimestamps = userMessageTimestamps.get(senderId);
  // Add current timestamp
  userTimestamps.push(now);

  // Filter out timestamps older than the time window (e.g., 10 seconds)
  const timeWindow = (spamConfig.time_window || 10) * 1000;
  const recentTimestamps = userTimestamps.filter((ts) => now - ts < timeWindow);

  userMessageTimestamps.set(senderId, recentTimestamps); // Update the user's log

  // Check if the user has exceeded the message count
  if (recentTimestamps.length > (spamConfig.message_count || 5)) {
    logger.warn(
      { user: senderId, group: groupId },
      "Spam detected, taking action."
    );

    // Take action
    if (spamConfig.action === "KICK") {
      await sock.sendMessage(groupId, {
        text: `🚫 تم حذف @${senderId.split("@")[0]} بسبب الإزعاج (Spam).`,
        mentions: [senderId],
      });
      await sock.groupParticipantsUpdate(groupId, [senderId], "remove");
    } else {
      // Default to WARN
      await sock.sendMessage(groupId, {
        text: `⚠️ تحذير لـ @${
          senderId.split("@")[0]
        }! الرجاء عدم إرسال رسائل مزعجة.`,
        mentions: [senderId],
      });
    }

    // Clear the user's log after taking action
    userMessageTimestamps.delete(senderId);
  }
}

module.exports = {
  handleAntiSpam,
};
