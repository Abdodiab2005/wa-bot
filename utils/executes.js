async function executeSendInvite(sock, session) {
  const { groupId, targetJid } = session;
  const adminJid = session.adminJid; // The admin who made the request

  try {
    // The bot needs to be an admin to get the invite code
    const code = await sock.groupInviteCode(groupId);
    const inviteLink = `https://chat.whatsapp.com/${code}`;

    const inviteMessage = `مرحبًا 👋\n\nلقد تمت دعوتك للانضمام إلى جروب واتساب.\nاضغط على الرابط أدناه للانضمام:\n\n${inviteLink}`;

    // Send the invite link to the target user's private chat
    await sock.sendMessage(targetJid, { text: inviteMessage });

    // Inform the admin that the invite was sent successfully
    await sock.sendMessage(groupId, {
      text: `✅ تم إرسال رابط الدعوة بنجاح إلى @${targetJid.split("@")[0]}`,
      mentions: [targetJid],
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to create or send group invite.");
    // Inform the admin that the bot failed (e.g., bot is not an admin)
    await sock.sendMessage(groupId, {
      text: `⚠️ فشلت في إنشاء رابط الدعوة. تأكد من أنني مشرف في الجروب.`,
    });
  }
}

// This function contains the actual logic to remove members
async function executeRemoveAll(sock, session) {
  const { groupId } = session;
  await sock.sendMessage(groupId, {
    text: "✅ تم التأكيد. بدء عملية إزالة الأعضاء... قد تستغرق هذه العملية بعض الوقت.",
  });

  try {
    // 1. Fetch the latest group metadata
    const metadata = await sock.groupMetadata(groupId);

    // 2. Filter the list to get only non-admin members
    const nonAdmins = metadata.participants.filter((p) => !p.admin);

    if (nonAdmins.length === 0) {
      return await sock.sendMessage(groupId, {
        text: "✅ لا يوجد أعضاء عاديون لحذفهم.",
      });
    }

    let removedCount = 0;
    // 3. Loop through each non-admin member to remove them
    for (const member of nonAdmins) {
      // 4. A crucial safety check: NEVER try to remove one of the owners
      if (config.owners.includes(member.id)) {
        logger.info(`[RemoveAll] Skipped removing owner: ${member.id}`);
        continue; // Skip to the next member
      }

      logger.info(`[RemoveAll] Removing ${member.id} from ${groupId}`);

      // 5. Perform the removal action
      await sock.groupParticipantsUpdate(groupId, [member.id], "remove");

      removedCount++;

      // 6. Delay between each removal to avoid WhatsApp's rate limits (429 error)
      await delay(1000); // 1-second delay
    }

    await sock.sendMessage(groupId, {
      text: `✅ اكتملت العملية بنجاح. تم إزالة ${removedCount} عضوًا.`,
    });
  } catch (error) {
    logger.error(`[Error] in executeRemoveAll:`, error);

    // 7. Specifically handle the "Too Many Requests" error
    if (error.output?.statusCode === 429) {
      await sock.sendMessage(groupId, {
        text: "⚠️ توقفت العملية مؤقتًا بسبب قيود واتساب. يرجى المحاولة مرة أخرى لاحقًا لإكمال العملية على باقي الأعضاء.",
      });
    } else {
      await sock.sendMessage(groupId, {
        text: "حدث خطأ فني أثناء إزالة الأعضاء. قد يكون السبب أنني لست مشرفًا.",
      });
    }
  }
}

module.exports = {
  executeRemoveAll,
  executeSendInvite,
};
