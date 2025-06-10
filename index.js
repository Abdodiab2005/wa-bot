const { server, io } = require("./app.js");
const PORT = process.env.PORT || 3000;
const logger = require("./utils/logger");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  Browsers,
  delay,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const path = require("path");
const pino = require("pino"); // pino for logging
const readline = require("readline"); // To get user input for pairing code
const qrcode = require("qrcode-terminal");
const NodeCache = require("node-cache"); // 1. استدعاء المكتبة
const fs = require("fs"); // File System module to read files
const config = require("./config/config.json"); // 1. تحميل ملف الإعدادات
const { initializeScheduledJobs } = require("./scheduler.js");
const { executeRemoveAll, executeSendInvite } = require("./utils/executes");
const { getGroupSettings } = require("./utils/storage.js");
const normalizeJid = require("./utils/normalizeJid.js");

// Read the owners string from .env, split it into an array, and trim any whitespace
const ownerString = process.env.OWNERS_LIST || "";
config.owners = ownerString.split(",").map((id) => id.trim());

let retryCount = 0;
const MAX_RETRIES = 5; // أقصى عدد للمحاولات
const RETRY_DELAY_MS = 5000; // 5 ثوانٍ كبداية للتأخير

// A map to hold pending command confirmations
const confirmationSessions = new Map();
const userMessageTimestamps = new Map();

// Function to get user input from the console
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (text) => new Promise((resolve) => rl.question(text, resolve));

const groupMetadataCache = new NodeCache({
  stdTTL: 60 * 60, // صلاحية الكاش لمدة ساعة (بالثواني)
  checkperiod: 60 * 5, // التحقق من صلاحية الكاش كل 5 دقائق
});

// Create a collection to store your commands
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
      level: "warn",
    }), // Use pino for logging, silent to keep console clean
    cachedGroupMetadata: (jid) => {
      return groupMetadataCache.get(jid);
    },
  });

  // --- Pairing Code Logic ---

  // 3. Listen for Connection Events
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // ✅ ***هذا هو المكان الصحيح لمنطق الـ Pairing Code***
    if (qr) {
      // عندما يتم توليد QR، نسأل المستخدم ماذا يريد
      const usePairingCode = await question(
        "Do you want to use a pairing code instead of QR? (yes/no) "
      );

      if (usePairingCode.toLowerCase() === "yes") {
        const phoneNumber = await question(
          "Please enter your phone number (e.g., 201234567890): "
        );
        try {
          const pairingCode = await sock.requestPairingCode(phoneNumber);
          logger.info(`✅ Your Pairing Code is: ${pairingCode}`);
        } catch (error) {
          logger.error("❌ Failed to request pairing code:", error);
        }
      } else {
        logger.info("Scan the QR code below:");
        io.emit("qr_update", qr);
        io.emit("status_update", { status: "QR Code Received" });

        // إذا لم يرد استخدام pairing code، يمكنك طباعة الـ QR code
        const qrcode = require("qrcode-terminal");
        qrcode.generate(qr, {
          small: true,
        });
      }
    } else {
      console.log("Qr haven't been generated yet.");
    }

    if (connection === "close") {
      const statusCode = lastDisconnect.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      io.emit("status_update", { status: "Disconnected" });

      if (shouldReconnect && retryCount < MAX_RETRIES) {
        retryCount++; // زيادة عداد المحاولات
        const delayMs = RETRY_DELAY_MS * retryCount; // زيادة التأخير (5s, 10s, 15s...)

        logger.info(
          `🔌 Connection closed. Reason: ${statusCode}. Retrying in ${
            delayMs / 1000
          }s... (Attempt ${retryCount}/${MAX_RETRIES})`
        );

        await delay(delayMs); // الانتظار قبل المحاولة التالية
        connectToWhatsApp(); // إعادة محاولة الاتصال
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
      retryCount = 0; // 🔄 ***أهم خطوة: إعادة تعيين العداد عند نجاح الاتصال***
      // منطق استباقي لملء الكاش ببيانات كل الجروبات
      io.emit("status_update", { status: "Connected" });

      logger.info(
        "[Cache] Proactively fetching and caching metadata for all groups..."
      );

      // Initialize scheduled jobs
      initializeScheduledJobs(sock);

      try {
        // جلب بيانات كل الجروبات المشارك فيها البوت
        const groups = await sock.groupFetchAllParticipating();

        // تخزين كل جروب في الكاش
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

  // 4. ***أهم خطوة: تحديث الكاش تلقائيًا***
  // هذا الجزء يستمع لأي تحديث في بيانات الجروبات (مثل انضمام عضو)
  // ويقوم بتخزين البيانات الجديدة في الكاش
  sock.ev.on("groups.upsert", (updates) => {
    for (const group of updates) {
      logger.info(`[Cache] Caching metadata for group: ${group.id}`);
      groupMetadataCache.set(group.id, group);
    }
  });

  // 4. Save Credentials on Update
  sock.ev.on("creds.update", saveCreds);
  // The final and complete messages.upsert handler
  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0];

    // --- 1. Blacklist Check (at the very top) ---
    if (msg.key.remoteJid.endsWith("@g.us")) {
      const groupId = msg.key.remoteJid;
      const senderId = normalizeJid(msg.key.participant);
      try {
        const settings = getGroupSettings(groupId);
        if (settings?.blacklist?.includes(senderId)) {
          const groupMetadata = await sock.groupMetadata(groupId);
          const senderIsAdmin = groupMetadata.participants.find(
            (p) => p.id === senderId
          )?.admin;
          if (!senderIsAdmin) {
            logger.info(`Ignoring message from blacklisted user ${senderId}`);
            return;
          }
        }
      } catch (error) {
        logger.error({ err: error }, "Error during blacklist check");
      }
    }

    // --- 2. Initial message filter ---
    if (
      !msg.message ||
      msg.key.remoteJid === "status@broadcast" ||
      msg.key.fromMe
    )
      return;

    const body =
      msg.message.conversation || msg.message.extendedTextMessage?.text || "";
    const senderId = normalizeJid(msg.key.participant || msg.key.remoteJid);

    // --- 3. Confirmation Handling ---
    if (confirmationSessions.has(senderId) && body.toLowerCase() === "yes") {
      const session = confirmationSessions.get(senderId);
      if (session.adminJid && session.adminJid !== senderId) return;
      confirmationSessions.delete(senderId);
      if (session.command === "removeall")
        await executeRemoveAll(sock, session);
      else if (session.command === "send_invite")
        await executeSendInvite(sock, session);
      return;
    }

    // --- 4. Main Logic: Route to Command Handler OR Regular Message Handlers ---
    const prefix = "!";
    if (body.startsWith(prefix)) {
      // --- This block handles COMMANDS ---
      const args = body.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();
      const command = commands.get(commandName);
      if (!command) return;

      const isGroup = msg.key.remoteJid.endsWith("@g.us");
      if (command.chat === "group" && !isGroup) return;
      if (command.chat === "private" && isGroup) return;

      try {
        const groupMetadata = isGroup
          ? await sock.groupMetadata(msg.key.remoteJid)
          : null;
        await command.execute(sock, msg, args, body, groupMetadata);
      } catch (error) {
        logger.error(
          { err: error, command: commandName },
          "Error executing command"
        );
        await sock.sendMessage(msg.key.remoteJid, { text: `حدث خطأ فني.` });
      }
    } else {
      // --- This block handles REGULAR MESSAGES (for antilink, antispam, etc.) ---
      const isGroup = msg.key.remoteJid.endsWith("@g.us");
      if (isGroup) {
        // We call all our moderation handlers for regular messages here
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

// Start the connection process

// --- ✅ 2. تشغيل السيرفر ---
server.listen(PORT, () => {
  logger.info(`Server is running at http://localhost:${PORT}`);
  connectToWhatsApp().catch((err) => logger.error("Unexpected error: " + err));
});
