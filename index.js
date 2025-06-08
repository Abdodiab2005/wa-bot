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
const normalizeJid = require("./utils/normalizeJid");
const { executeRemoveAll, executeSendInvite } = require("./utils/executes");

let retryCount = 0;
const MAX_RETRIES = 5; // أقصى عدد للمحاولات
const RETRY_DELAY_MS = 5000; // 5 ثوانٍ كبداية للتأخير

// A map to hold pending command confirmations
const confirmationSessions = new Map();

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
  commands.set(command.name, command);
  logger.info(`[Commands] Loaded command: ${command.name}`);
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

  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.remoteJid === "status@broadcast") return;

    const body =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      "";
    const senderId = msg.key.participant || msg.key.remoteJid;

    if (confirmationSessions.has(senderId) && body.toLowerCase() === "yes") {
      const session = confirmationSessions.get(senderId);

      // Make sure the person confirming is the one who initiated
      if (session.adminJid && session.adminJid !== senderId) return;

      confirmationSessions.delete(senderId); // Use the confirmation once

      if (session.command === "removeall") {
        await executeRemoveAll(sock, session);
      } else if (session.command === "send_invite") {
        // <-- ✅ The new part
        await executeSendInvite(sock, session);
      }
      return;
    }
    const prefix = "!";

    // --- Main Logic: Check if it's a command or a regular message ---
    if (body.startsWith(prefix)) {
      // --- This block handles COMMANDS ---
      const args = body.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();
      const command = commands.get(commandName);
      if (!command) return;

      const isGroup = msg.key.remoteJid.endsWith("@g.us");
      if (command.chat === "group" && !isGroup) return;
      if (command.chat === "private" && isGroup) return;

      const groupMetadata = isGroup
        ? await sock.groupMetadata(msg.key.remoteJid)
        : null;

      const isOwner = config.owners.includes(normalizeJid(senderId));
      const isSenderAdmin =
        isGroup &&
        groupMetadata.participants.some(
          (p) =>
            ["admin", "superadmin"].includes(p.admin) &&
            normalizeJid(p.id) === normalizeJid(senderId)
        );

      // --- ✅ THE FINAL FIX IS HERE ---
      const isBotAdmin =
        isGroup &&
        groupMetadata.participants.some(
          (p) =>
            ["admin", "superadmin"].includes(p.admin) &&
            normalizeJid(p.id) === normalizeJid(sock.user.lid)
        );

      const permissionLevel =
        config.command_permissions[commandName] || "MEMBERS";
      let hasPermission = false;
      switch (permissionLevel) {
        case "MEMBERS":
          hasPermission = true;
          break;
        case "OWNER_ONLY":
          if (isOwner) hasPermission = true;
          break;
        case "ADMINS_ONLY":
          if (isSenderAdmin) hasPermission = true;
          break;
        case "ADMINS_OWNER":
          if (isOwner || isSenderAdmin) hasPermission = true;
          break;
      }

      if (!hasPermission)
        return await sock.sendMessage(msg.key.remoteJid, {
          text: "🚫 ليس لديك الصلاحية لاستخدام هذا الأمر.",
        });
      if (command.botAdminRequired && !isBotAdmin)
        return await sock.sendMessage(msg.key.remoteJid, {
          text: "⚠️ لا يمكنني تنفيذ هذا الأمر لأني لست مشرفًا في هذا الجروب.",
        });

      logger.info(`[Commands] Executing command: ${commandName}`);
      try {
        await command.execute(
          sock,
          msg,
          args,
          body,
          groupMetadata,
          confirmationSessions
        );
      } catch (error) {
        logger.error(`[Error] in command ${commandName}:`, error);
      }
    } else {
      // --- This block handles REGULAR MESSAGES (for Anti-Link) ---
      const { handleAntiLink } = require("./commands/antilink.js");
      const { handleMediaControl } = require("./commands/media.js");

      // We run media control first. If it deletes the message, we stop.
      const mediaActionTaken = await handleMediaControl(
        sock,
        msg,
        config,
        normalizeJid
      );

      // If no media was deleted, then we check for links.
      if (!mediaActionTaken) {
        await handleAntiLink(sock, msg, config, normalizeJid);
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
