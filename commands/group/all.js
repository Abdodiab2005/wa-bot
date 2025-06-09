// file: /commands/all.js
const logger = require("../../utils/logger.js");

module.exports = {
  name: "all",
  description: "Mentions all members of the group.",
  chat: "group",

  async execute(sock, msg, args) {
    try {
      // 1. Get the group's JID (JID = WhatsApp ID)
      const groupId = msg.key.remoteJid;

      // 2. Get the group's metadata (this includes the list of participants)
      // We fetch it fresh to make sure we have the latest list of members.
      const metadata = await sock.groupMetadata(groupId);

      // 3. Get the list of admins
      const admins = metadata.participants
        .filter((p) => p.admin)
        .map((p) => p.id);

      // 4. Get the sender's ID
      const senderId = msg.key.participant || msg.key.remoteJid;

      // 5. CHECK PERMISSIONS: Only admins can use this command
      //   if (!admins.includes(senderId)) {
      //     return await sock.sendMessage(groupId, {
      //       text: "⚠️ هذا الأمر مخصص للمشرفين فقط.",
      //     });
      //   }

      // 6. Get the list of all participant JIDs
      const participants = metadata.participants.map((p) => p.id);

      // 7. Prepare the message text and the mentions array
      // You can customize the message text here
      let text = "📢 | تنبيه للجميع\n\n";
      if (args && args.length > 0) {
        text = `*رسالة من المشرف:*\n${args.join(" ")}\n\n*المنشن للجميع:*\n`;
      }

      // Add a tag for each participant to the text
      for (let participant of participants) {
        // We use the phone number part of the JID for the @mention
        text += `@${participant.split("@")[0]} `;
      }

      // 8. Send the message with mentions
      // The `mentions` property is an array of JIDs that should be mentioned.
      await sock.sendMessage(groupId, {
        text: text,
        mentions: participants,
      });
    } catch (error) {
      logger.error("[Error] in !all command:", error);
      // Send a reply in case of an error
      await sock.sendMessage(msg.key.remoteJid, {
        text: "حدث خطأ أثناء محاولة عمل منشن للجميع.",
      });
    }
  },
};
