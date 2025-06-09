// commands/antiSpam.js
const logger = require("../../utils/logger");

// إعدادات يمكن تعديلها
const SPAM_MESSAGE_COUNT = 3; // عدد الرسائل المتطابقة لتعتبر سبام
const SPAM_TIME_WINDOW_SECONDS = 8; // خلال كم ثانية
const SPAM_WARN_LIMIT = 2; // عدد تحذيرات السبام قبل الطرد

// ذاكرة مؤقتة لتخزين رسائل المستخدمين وتحذيراتهم
const antiSpamCache = new Map();

/**
 * دالة لمعالجة الرسائل والتحقق من التكرار (السبام)
 * @param {import('@whiskeysockets/baileys').WASocket} sock - The socket connection
 * @param {import('@whiskeysockets/baileys').WAMessage} msg - The message object
 */
async function handleAntiSpam(sock, msg) {
  const isGroup = msg.key.remoteJid.endsWith("@g.us");
  if (!isGroup) return; // النظام يعمل فقط في المجموعات

  const senderId = msg.key.participant || msg.key.remoteJid;
  const groupId = msg.key.remoteJid;

  try {
    // لا نطبق النظام على المشرفين لتجنب طردهم بالخطأ
    const groupMetadata = await sock.groupMetadata(groupId);
    const senderIsAdmin = groupMetadata.participants.find(
      (p) => p.id === senderId
    )?.admin;
    if (senderIsAdmin === "admin" || senderIsAdmin === "superadmin") {
      return;
    }

    const messageContent = JSON.stringify(msg.message); // طريقة دقيقة لمقارنة محتوى الرسالة
    const now = Math.floor(Date.now() / 1000);
    const cacheKey = `${senderId}_${groupId}`;

    if (!antiSpamCache.has(cacheKey)) {
      antiSpamCache.set(cacheKey, { messages: [], warnCount: 0 });
    }
    const userData = antiSpamCache.get(cacheKey);

    // 1. فلترة الرسائل القديمة
    userData.messages = userData.messages.filter(
      (m) => now - m.timestamp < SPAM_TIME_WINDOW_SECONDS
    );

    // 2. إضافة الرسالة الجديدة
    userData.messages.push({ content: messageContent, timestamp: now });

    // 3. التحقق من وجود تكرار
    const repeatedMessages = userData.messages.filter(
      (m) => m.content === messageContent
    );

    if (repeatedMessages.length >= SPAM_MESSAGE_COUNT) {
      userData.warnCount += 1;
      userData.messages = []; // مسح الرسائل بعد اكتشاف السبام لمنع التحذيرات المتتالية

      if (userData.warnCount >= SPAM_WARN_LIMIT) {
        logger.info(
          `[AntiSpam] Kicking ${senderId} from ${groupId} for repeated spam.`
        );
        // إعادة تعيين العداد بعد الطرد
        antiSpamCache.delete(cacheKey);

        await sock.sendMessage(groupId, {
          text: `🚫 تم طرد المستخدم @${
            senderId.split("@")[0]
          } تلقائيًا بسبب الإزعاج.`,
          mentions: [senderId],
        });
        await sock.groupParticipantsUpdate(groupId, [senderId], "remove");
      } else {
        logger.info(
          `[AntiSpam] Warning ${senderId} in ${groupId}. Warn count: ${userData.warnCount}`
        );
        await sock.sendMessage(groupId, {
          text: `⚠️ تحذير للمستخدم @${
            senderId.split("@")[0]
          } بسبب تكرار الرسائل.\nالتحذير رقم: ${userData.warnCount}`,
          mentions: [senderId],
        });
      }
    }
  } catch (error) {
    logger.error({ err: error }, "Error in handleAntiSpam");
  }
}

module.exports = { handleAntiSpam };
