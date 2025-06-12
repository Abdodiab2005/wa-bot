const {
  default: makeWASocket,
  useMultiFileAuthState,
  Browsers,
  delay,
  DisconnectReason,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");

const axios = require("axios");
const path = require("path");
const pino = require("pino"); // pino for logging
const qrcode = require("qrcode-terminal");
const NodeCache = require("node-cache"); // 1. استدعاء المكتبة
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs"); // File System module to read files
require("dotenv").config();

// custom imports
const config = require("./config/config.json"); // 1. تحميل ملف الإعدادات
const normalizeJid = require("./utils/normalizeJid.js");
const { initializeScheduledJobs } = require("./scheduler.js");
const {
  getArchivedMessage,
  cacheMessage,
  getGroupSettings,
  getTelegramId,
  saveTelegramId,
  getAllChannels,
  saveMessageMapping,
  getTelegramMsgByWhatsappId,
  deleteMapping,
} = require("./utils/storage.js"); // Make sure these are required
const { server, io } = require("./app.js");
const logger = require("./utils/logger");
const { formatWhatsappToTelegram } = require("./utils/helper.js");

// Import secrets
const PORT = process.env.PORT || 3000;
const LOG_CHAT_ID = process.env.LOG_CHAT_ID;
const CHANNELS = process.env.CHANNELS;
const ownerString = process.env.OWNERS_LIST || "";

// Read the owners string from .env, split it into an array, and trim any whitespace
config.owners = ownerString.split(",").map((id) => id.trim());

// Prepare Telegram Bot
const tgBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
});

// Prepare channels sending
(() => {
  if (!CHANNELS) return;

  const dbChannels = getAllChannels(); // Sync
  const pairs = CHANNELS.split(",").map((pair) => {
    const [telegram, whatsapp] = pair.split(":").map((id) => id.trim());
    return { telegram, whatsapp };
  });

  pairs.forEach(({ telegram, whatsapp }) => {
    const exists = dbChannels.some((channel) => {
      return (
        channel.telegram_channel_id === telegram &&
        channel.whatsapp_group_id === whatsapp
      );
    });

    if (!exists) {
      saveTelegramId(telegram, whatsapp, "");
    }
  });
})();

const CHANNEL_MAP = {};

process.env.CHANNELS.split(",").forEach((entry) => {
  const [wa, tg] = entry.split(":");
  if (wa && tg) CHANNEL_MAP[wa] = tg;
});

// Prepare retry logic
let retryCount = 0;
const MAX_RETRIES = 5; // أقصى عدد للمحاولات
const RETRY_DELAY_MS = 5000; // 5 ثوانٍ كبداية للتأخير

// Prepare confirmation sessions
const confirmationSessions = new Map();
const userMessageTimestamps = new Map();

// Prepare group metadata cache
const groupMetadataCache = new NodeCache({
  stdTTL: 60 * 60, // صلاحية الكاش لمدة ساعة (بالثواني)
  checkperiod: 60 * 5, // التحقق من صلاحية الكاش كل 5 دقائق
});

// Prepare commands collection
const commands = new Map();
const commandFiles = fs
  .readdirSync("./commands")
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  if (command.name) {
    // Register the main command name
    commands.set(command.name, command);
    logger.info(`[Commands] Loaded command: ${command.name}`);

    // If the command has aliases, register them too
    if (command.aliases && Array.isArray(command.aliases)) {
      command.aliases.forEach((alias) => {
        commands.set(alias, command);
        logger.info(` -> Registered alias: ${alias}`);
      });
    }
  }
}

const mediaDir = path.join(__dirname, "media");
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir);

// Date options
const options = {
  timeZone: "Africa/Cairo", // <-- هذا هو الجزء الأهم
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true, // لعرض الوقت بنظام 12 ساعة (صباحًا/مساءً)
};

// Prepare anti-spam function
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

async function connectToWhatsApp() {
  // 1. Manage Authentication State
  const { state, saveCreds } = await useMultiFileAuthState(
    path.resolve(__dirname, "auth_info_baileys")
  );

  // 2. Create the Socket Connection
  const sock = makeWASocket({
    auth: state,
    browser: Browsers.windows("Desktop"), // Simulate a browser
    markOnlineOnConnect: false,
    logger: pino({
      level: "silent",
    }), // Use pino for logging, silent to keep console clean
    cachedGroupMetadata: (jid) => {
      return groupMetadataCache.get(jid);
    },
  });

  // 3. Listen for Connection Events
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info("Scan the QR code below:");
      io.emit("qr_update", qr);
      io.emit("status_update", { status: "QR Code Received" });
      qrcode.generate(qr, {
        small: true,
      });
    } else {
      logger.warn(`Qr code haven't generated yet`);
    }

    if (connection === "close") {
      const statusCode = lastDisconnect.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      io.emit("status_update", { status: "Disconnected" });

      if (shouldReconnect && retryCount < MAX_RETRIES) {
        retryCount++; // Increase retry count
        const delayMs = RETRY_DELAY_MS * retryCount; // Increase delay (5s, 10s, 15s...)

        logger.info(
          `🔌 Connection closed. Reason: ${statusCode}. Retrying in ${
            delayMs / 1000
          }s... (Attempt ${retryCount}/${MAX_RETRIES})`
        );

        await delay(delayMs); // Wait before retrying
        connectToWhatsApp(); // Retry connection
      } else if (!shouldReconnect) {
        logger.error(
          "❌ Connection closed permanently. Reason: Logged Out. Please delete the 'auth_info_baileys' folder and scan again."
        );
        process.exit(1);
      } else {
        logger.error(
          `❌ Max retries (${MAX_RETRIES}) reached. Could not connect to WhatsApp. Exiting.`
        );
        process.exit(1);
      }
    } else if (connection === "open") {
      logger.info("✅ Connection opened successfully!");
      retryCount = 0;
      io.emit("status_update", { status: "Connected" });

      logger.info(
        "[Cache] Proactively fetching and caching metadata for all groups..."
      );

      // Initialize scheduled jobs
      initializeScheduledJobs(sock);

      try {
        // Fetch and cache all groups
        const groups = await sock.groupFetchAllParticipating();

        // Store all groups in cache
        let cachedCount = 0;
        for (const jid in groups) {
          groupMetadataCache.set(jid, groups[jid]);
          cachedCount++;
        }

        logger.info(
          `[Cache] Successfully cached metadata for ${cachedCount} groups.`
        );
      } catch (err) {
        logger.error("[Error] Failed to fetch and cache all groups:", err);
      }
    }
  });

  // 4. Save secret keys (Groups) into cache if not exits to avoid heavy requests and avoid ban
  sock.ev.on("groups.upsert", (updates) => {
    for (const group of updates) {
      logger.info(`[Cache] Caching metadata for group: ${group.id}`);
      groupMetadataCache.set(group.id, group);
    }
  });

  // 5. Save Credentials on Update
  sock.ev.on("creds.update", saveCreds);

  // 6. Handle messages
  sock.ev.on("messages.upsert", async (m) => {
    // We only care about new messages/updates
    if (m.type !== "notify" || !m.messages[0]) return;

    const msg = m.messages[0];

    // Handle channels messages
    if (
      msg.key.remoteJid.endsWith("@newsletter") &&
      CHANNEL_MAP[msg.key.remoteJid]
    ) {
      const telegramChannel = CHANNEL_MAP[msg.key.remoteJid];

      if (!msg.message) {
        logger.info(`[🗑️] Possibly deleted message: ${msg.key.id}`);
        const deleted = await getTelegramMsgByWhatsappId(msg.key.id);
        if (deleted) {
          try {
            await tgBot.deleteMessage(
              deleted.telegram_channel,
              deleted.telegram_msg_id
            );
            logger.info(
              `[✅] Deleted Telegram message: ${deleted.telegram_msg_id}`
            );
            await deleteMapping(msg.key.id);
          } catch (err) {
            logger.error(
              "❌ Failed to delete message in Telegram:",
              err.message
            );
          }
        }
        return; // ⛔ لازم توقف هنا لو الرسالة محذوفة
      }

      // Try to send message to telegram
      try {
        const whatsappChannel = msg.key.remoteJid;
        const telegramChannel = await getTelegramId(whatsappChannel);
        logger.info(`sending to channel: ${telegramChannel}`);
        if (!telegramChannel) return;

        const type = Object.keys(msg.message || {})[0];
        const content = msg.message[type];
        if (
          [
            "imageMessage",
            "videoMessage",
            "audioMessage",
            "stickerMessage",
          ].includes(type)
        ) {
          const response = await axios.get(content.url, {
            responseType: "arraybuffer",
          });

          const buffer = Buffer.from(response.data);

          const options = {
            caption: content.caption
              ? formatWhatsappToTelegram(content.caption)
              : "",
            parse_mode: "HTML",
          };

          if (type === "imageMessage") {
            const sent = await tgBot.sendPhoto(
              telegramChannel,
              buffer,
              options
            );
            if (sent) {
              await saveMessageMapping(
                msg.key.id,
                sent.message_id,
                telegramChannel
              );
            }
          } else if (type === "videoMessage") {
            const sent = await tgBot.sendVideo(
              telegramChannel,
              buffer,
              options
            );
            if (sent) {
              await saveMessageMapping(
                msg.key.id,
                sent.message_id,
                telegramChannel
              );
            }
          } else if (type === "audioMessage") {
            const sent = await tgBot.sendAudio(telegramChannel, buffer);
            if (sent) {
              await saveMessageMapping(
                msg.key.id,
                sent.message_id,
                telegramChannel
              );
            }
          } else if (type === "stickerMessage") {
            const sent = await tgBot.sendSticker(telegramChannel, buffer);
            if (sent) {
              await saveMessageMapping(
                msg.key.id,
                sent.message_id,
                telegramChannel
              );
            }
          }
        } else {
          const text = content || content?.extendedTextMessage?.text || "";
          const formatted = formatWhatsappToTelegram(text);
          const sent = await tgBot.sendMessage(telegramChannel, formatted, {
            parse_mode: "HTML",
          });
          if (sent) {
            await saveMessageMapping(
              msg.key.id,
              sent.message_id,
              telegramChannel
            );
          }
        }
      } catch (error) {
        logger.error(`Error sending message to telegram: ${error.message}`);
      }
    }

    // This allows us to retrieve it later if it gets deleted.
    if (
      msg.key.id &&
      !msg.key.remoteJid.endsWith("@newsletter") &&
      !msg.key.fromMe
    ) {
      const msgType = Object.keys(msg.message || {})[0];
      const time = msg.messageTimestamp;
      const key = msg.key;

      let stored = {
        key,
        time,
        type: msgType,
      };

      // ✅ رسالة نصية
      if (msgType === "conversation") {
        stored.message = msg.message.conversation;
      }

      // ✅ صورة أو فيديو (مع caption)
      else if (msgType === "imageMessage" || msgType === "videoMessage") {
        const mediaBuffer = await downloadMediaMessage(msg, "buffer", {});
        const ext = msgType === "imageMessage" ? "jpg" : "mp4";
        const filename = `${key.id}.${ext}`;
        const savePath = path.join(__dirname, "media", filename);
        fs.writeFileSync(savePath, mediaBuffer);

        stored.mediaPath = savePath;
        stored.caption = msg.message[msgType].caption || "";
      }

      // ✅ استيكر أو صوت (بدون caption)
      else if (msgType === "stickerMessage" || msgType === "audioMessage") {
        const mediaBuffer = await downloadMediaMessage(msg, "buffer", {});
        const ext = msgType === "audioMessage" ? "mp3" : "webp";
        const filename = `${key.id}.${ext}`;
        const savePath = path.join(__dirname, "media", filename);
        fs.writeFileSync(savePath, mediaBuffer);

        stored.mediaPath = savePath;
      }

      // ✅ خزّن الرسالة في الكاش
      cacheMessage(key.id, stored);
    }

    // Handle deleted messages (revoke)
    // This is a special event type and must be handled immediately.

    if (
      (msg.message?.protocolMessage?.type &&
        msg.message?.protocolMessage?.type !== undefined) !== undefined &&
      !msg.key.remoteJid.endsWith("@newsletter") &&
      !msg.key.fromMe
    ) {
      logger.info(`[Anti-Delete] Deletion event detected.`);

      try {
        const revokedMsgKey = msg.message.protocolMessage.key;
        const originalMsg = getArchivedMessage(revokedMsgKey.id);

        if (originalMsg) {
          // We found the deleted message in our database cache
          const sender =
            originalMsg.key.participant || originalMsg.key.remoteJid;

          // Let's get the group name if it's a group chat
          const groupName = originalMsg.key.remoteJid.endsWith("@g.us")
            ? (await sock.groupMetadata(originalMsg.key.remoteJid)).subject
            : "Private Chat";

          const logMessage =
            `*🗑️ رسالة محذوفة 🗑️*\n\n` +
            `*من:* @${sender.split("@")[0]}\n` +
            `*في:* ${groupName}\n` +
            `التوقيت: ${new Date(originalMsg.time * 1000).toLocaleString(
              options
            )}\n` +
            `${originalMsg.caption ? `الكابشن: ${originalMsg.caption}\n` : ""}`;

          const originalMsgContent = originalMsg.type
            ? originalMsg.message
            : "";
          const msgType = originalMsg.type;

          const logDestination = LOG_CHAT_ID;

          if (
            [
              "imageMessage",
              "videoMessage",
              "stickerMessage",
              "audioMessage",
            ].includes(msgType)
          ) {
            let mediaBuffer;
            if (originalMsg.mediaPath && fs.existsSync(originalMsg.mediaPath)) {
              mediaBuffer = fs.readFileSync(originalMsg.mediaPath);
            } else {
              mediaBuffer = await downloadMediaMessage(
                originalMsg,
                "buffer",
                {}
              );
            }

            let mediaOptions = { caption: logMessage, mentions: [sender] };
            if (msgType === "imageMessage") {
              await sock.sendMessage(logDestination, {
                image: mediaBuffer,
                ...mediaOptions,
              });
            } else if (msgType === "videoMessage") {
              await sock.sendMessage(logDestination, {
                video: mediaBuffer,
                ...mediaOptions,
              });
            }

            // For sticker and audio, we send the info separately as caption is not always supported
            if (msgType === "stickerMessage") {
              await sock.sendMessage(logDestination, { sticker: mediaBuffer });
              setTimeout(async () => {
                await sock.sendMessage(logDestination, {
                  text: logMessage,
                  mentions: [sender],
                });
              }, 500);
            }
            if (msgType === "audioMessage") {
              await sock.sendMessage(logDestination, {
                audio: mediaBuffer,
                mimetype: "audio/mp4",
              });
              setTimeout(async () => {
                await sock.sendMessage(logDestination, {
                  text: logMessage,
                  mentions: [sender],
                });
              }, 500);
            }
          } else {
            // It's a text message
            await sock.sendMessage(logDestination, {
              text: `${logMessage}\n*الرسالة:* ${originalMsgContent}`,
              mentions: [sender],
            });
          }
        } else {
          logger.warn(
            "Could not find the deleted message in cache (it was probably sent while bot was offline)."
          );
        }
      } catch (error) {
        logger.error({ err: error }, "Error in Anti-Delete system.");
      }

      return; // IMPORTANT: Stop all further processing for this event.
    }

    // --- 3. STANDARD MESSAGE FILTERS ---
    // Now that we've handled deletions, we can filter out other messages we don't want to process.
    if (
      !msg.message ||
      msg.key.remoteJid === "status@broadcast" ||
      msg.key.remoteJid.endsWith("@newsletter")
    ) {
      return;
    }

    // --- 3. Parse Message Context ---
    const body =
      msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    const senderId = normalizeJid(msg.key.participant || msg.key.remoteJid);
    const isGroup = msg.key.remoteJid.endsWith("@g.us");

    // --- 4. Blacklist Check ---
    if (isGroup) {
      const settings = getGroupSettings(msg.key.remoteJid);
      if (settings?.blacklist?.includes(senderId)) {
        const groupMetadata = await sock.groupMetadata(msg.key.remoteJid);
        const isSenderAdmin = groupMetadata.participants.some(
          (p) => p.admin && p.id === senderId
        );
        if (!isSenderAdmin)
          return logger.info(
            `Ignoring message from blacklisted user ${senderId}`
          );
      }
    }

    // --- 5. Confirmation Handling ---
    if (confirmationSessions.has(senderId) && body.toLowerCase() === "yes") {
      // (Your existing confirmation logic for removeall and send_invite goes here)
      return;
    }

    // --- 6. Main Router: Command or Regular Message? ---
    const prefix = "!";
    if (body.startsWith(prefix)) {
      // --- This block handles COMMANDS ---
      const args = body.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();
      const command = commands.get(commandName);
      if (!command) return;

      try {
        const groupMetadata = isGroup
          ? await sock.groupMetadata(msg.key.remoteJid)
          : null;
        // The index.js handler just passes the context to the command file.
        await command.execute(sock, msg, args, body, groupMetadata);
      } catch (error) {
        logger.error(
          { err: error, command: commandName },
          "Error executing command"
        );
      }
    } else {
      // --- This block handles REGULAR MESSAGES ---
      if (isGroup) {
        // Call all moderation handlers for regular messages here
        const { handleAntiLink } = require("./commands/group/antilink.js");
        const { handleMediaControl } = require("./commands/group/media.js");
        // handleAntiSpam is a global function in index.js

        const linkActionTaken = await handleAntiLink(
          sock,
          msg,
          config,
          normalizeJid
        );
        if (!linkActionTaken) {
          const mediaActionTaken = await handleMediaControl(
            sock,
            msg,
            config,
            normalizeJid
          );
          if (!mediaActionTaken) {
            await handleAntiSpam(sock, msg);
          }
        }
      }
    }
  });

  sock.ev.on("group-participants.update", async (update) => {
    const { id, participants, action } = update;
    logger.info({ update }, "Received group participants update");

    // We only care about the 'add' action
    if (action !== "add") {
      logger.info(`[Group] ${action} action for ${id}`);
      return;
    }

    try {
      const settings = getGroupSettings(id);
      const welcomeConfig = settings?.welcome_system;

      // Stop if the welcome system is disabled or has no messages
      if (
        !welcomeConfig ||
        !welcomeConfig.enabled ||
        welcomeConfig.messages.length === 0
      ) {
        logger.warn(
          `[Group] Welcome system is disabled or has no messages for ${id}`
        );
        return;
      }

      // Loop through each new participant
      for (const participant of participants) {
        // Pick a random message from the array
        const randomIndex = Math.floor(
          Math.random() * welcomeConfig.messages.length
        );
        const welcomeMessage = welcomeConfig.messages[randomIndex];

        // Replace the placeholder ${user} with a mention
        const finalMessage = welcomeMessage.replace(
          /\${user}/g,
          `@${participant.split("@")[0]}`
        );

        // Send the welcome message with a small delay
        await delay(1000); // 1-second delay
        await sock.sendMessage(id, {
          text: finalMessage,
          mentions: [participant],
        });
      }
    } catch (error) {
      logger.error(
        { err: error, update },
        "Error in group-participants.update event"
      );
    }
  });

  sock.ev.on("group-requests.update", async (events) => {
    // This event fires when a new user requests to join a group
    logger.info({ events }, "Received group join request update");

    for (const request of events) {
      // We only care about new requests
      if (request.type !== "request") continue;

      const groupId = request.jid;
      const participantId = request.from;

      try {
        const settings = getGroupSettings(groupId);

        // Check if auto-approve is enabled for this group
        if (settings?.join_requests?.auto_approve_enabled) {
          logger.info(
            `[Auto-Approve] Approving ${participantId} for group ${groupId}`
          );

          // Approve the join request
          await sock.groupRequestUpdate(groupId, participantId, "approve");

          // Optional: Send a notification to the group that the user was auto-approved
          await delay(500); // Small delay
          await sock.sendMessage(groupId, {
            text: `✅ تم قبول طلب انضمام @${
              participantId.split("@")[0]
            } تلقائيًا.`,
            mentions: [participantId],
          });
        }
      } catch (error) {
        logger.error({ err: error, request }, "Error in auto-approve event");
      }
    }
  });
}

// --- Start the server ---
server.listen(PORT, () => {
  logger.info(`Server is running at http://localhost:${PORT}`);
  connectToWhatsApp().catch((err) => logger.error("Unexpected error: " + err));
});
