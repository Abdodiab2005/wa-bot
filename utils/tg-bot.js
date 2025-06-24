const tgBot = require("../services/tg-bot");
const si = require("systeminformation");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const logger = require("./logger");
const logDirectory = path.join(__dirname, "../logs");

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory);
}

// --- دالة ترسل الخطأ لتليجرام ---
function notifyTelegramError(message) {
  const logMessage = `🚨 *حدث خطأ!*\n\n\`\`\`\n${message}\n\`\`\``;
  tgBot
    .sendMessage(ADMIN_CHAT_ID, logMessage, { parse_mode: "Markdown" })
    .catch(logger.error);
}

// نسجل خطأ + نرسل لتليجرام
function logAndNotifyError(message) {
  logger.error(message);
  notifyTelegramError(message);
}

logger.info("✅ Telegram monitor tgBot is running.");
logger.info(`📩 tgBot will send logs to admin ID: ${ADMIN_CHAT_ID}`);

// --- دوال مساعدة ---
async function getSystemStatus() {
  try {
    const cpu = await si.currentLoad();
    const mem = await si.mem();
    const fsSize = await si.fsSize();

    const memUsedPercent = ((mem.used / mem.total) * 100).toFixed(2);
    const disk = fsSize.find((d) => d.mount === "/");
    const diskUsedPercent = disk ? disk.use.toFixed(2) : "N/A";

    let statusMessage = `*📊 حالة النظام الحالية*\n\n`;
    statusMessage += `*💻 CPU:* ${cpu.currentLoad.toFixed(2)}%\n`;
    statusMessage += `*🧠 RAM:* ${memUsedPercent}% مستخدم\n`;
    statusMessage += `*💾 Disk:* ${diskUsedPercent}% مستخدم`;

    return statusMessage;
  } catch (error) {
    logAndNotifyError(`فشل في جلب حالة النظام: ${error.message}`);
    return "حدث خطأ أثناء جلب حالة النظام.";
  }
}

function getLogFileContent(fileType) {
  const fileName = fileType === "error" ? "error.log" : "combined.log";
  const filePath = path.join(logDirectory, fileName);

  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim() !== "");
    const lastLines = lines.slice(-50).join("\n");
    return `\`\`\`\n${lastLines || "الملف فارغ حالياً."}\n\`\`\``;
  } else {
    return "ملف السجلات غير موجود.";
  }
}

function executePM2Command(command) {
  return new Promise((resolve, reject) => {
    logger.info(`تنفيذ أمر PM2: ${command}`);
    exec(command, (error, stdout, stderr) => {
      if (error) {
        logAndNotifyError(`خطأ في تنفيذ أمر PM2: ${error.message}`);
        return reject(`خطأ: ${error.message}`);
      }
      if (stderr) logger.warn(`تحذير من PM2: ${stderr}`);
      resolve(stdout || "تم تنفيذ الأمر بنجاح.");
    });
  });
}

// --- أوامر البوت ---
async function runTgBot() {
  tgBot.onText(/\/start/, (msg) => {
    if (String(msg.chat.id) !== ADMIN_CHAT_ID) return;
    tgBot.sendMessage(
      ADMIN_CHAT_ID,
      "أهلاً بك يا عبد الرحمن! أنا بوت المراقبة الخاص بك. استخدم الأوامر لعرض حالة النظام والسجلات."
    );
  });

  tgBot.onText(/\/status/, async (msg) => {
    if (String(msg.chat.id) !== ADMIN_CHAT_ID) return;
    const status = await getSystemStatus();
    tgBot.sendMessage(ADMIN_CHAT_ID, status, { parse_mode: "Markdown" });
  });

  tgBot.onText(/\/logs/, (msg) => {
    if (String(msg.chat.id) !== ADMIN_CHAT_ID) return;
    const options = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🟡 Combined Logs",
              callback_data: "logs_combined",
            },
          ],
          [
            {
              text: "🔴 Error Logs",
              callback_data: "logs_error",
            },
          ],
        ],
      },
    };
    tgBot.sendMessage(ADMIN_CHAT_ID, "اختر نوع السجلات:", options);
  });

  tgBot.onText(/\/pm2/, (msg) => {
    if (String(msg.chat.id) !== ADMIN_CHAT_ID) return;
    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Restart App", callback_data: "pm2_start" }],
          [{ text: "⛔ Stop App", callback_data: "pm2_stop" }],
          [{ text: "📋 List Apps", callback_data: "pm2_list" }],
        ],
      },
    };
    tgBot.sendMessage(ADMIN_CHAT_ID, "اختر أمر PM2:", options);
  });

  tgBot.onText(/\/sh (.+)/, (msg, match) => {
    if (String(msg.chat.id) !== ADMIN_CHAT_ID) return;

    const shellCommand = match[1];

    if (!shellCommand) {
      return tgBot.sendMessage(ADMIN_CHAT_ID, "❌ يرجى كتابة أمر بعد /sh");
    }

    logger.info(`تشغيل أمر من التيرمنال عبر البوت: ${shellCommand}`);

    exec(shellCommand, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        logAndNotifyError(`❌ خطأ أثناء تنفيذ الأمر:\n${error.message}`);
        return tgBot.sendMessage(
          ADMIN_CHAT_ID,
          `*حدث خطأ أثناء تنفيذ الأمر:*\n\`\`\`${error.message}\`\`\``,
          { parse_mode: "Markdown" }
        );
      }

      const response = stdout || stderr || "✅ تم تنفيذ الأمر بدون مخرجات.";

      tgBot.sendMessage(
        ADMIN_CHAT_ID,
        `*📟 نتيجة تنفيذ: \`${shellCommand}\`*\n\`\`\`\n${response.slice(
          0,
          4000
        )}\n\`\`\``,
        { parse_mode: "Markdown" }
      );
    });
  });

  // --- التعامل مع الردود ---
  tgBot.on("callback_query", async (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;

    if (String(msg.chat.id) !== ADMIN_CHAT_ID) return;

    tgBot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      { chat_id: msg.chat.id, message_id: msg.message_id }
    );

    if (data.startsWith("logs_")) {
      const type = data.split("_")[1];
      const content = getLogFileContent(type);
      tgBot.sendMessage(
        ADMIN_CHAT_ID,
        `*آخر 50 سطر من ${type} logs:*\n${content}`,
        { parse_mode: "Markdown" }
      );
    }

    if (data.startsWith("pm2_")) {
      let response = "أمر غير معروف.";
      try {
        switch (data) {
          case "pm2_start":
            response = await executePM2Command("pm2 restart wa-tgBot");
            break;
          case "pm2_stop":
            response = await executePM2Command("pm2 stop wa-tgBot");
            break;
          case "pm2_list":
            response = await executePM2Command("pm2 list");
            break;
        }
        tgBot.sendMessage(
          ADMIN_CHAT_ID,
          `*نتيجة أمر PM2:*\n\`\`\`\n${response}\n\`\`\``,
          { parse_mode: "Markdown" }
        );
      } catch (error) {
        tgBot.sendMessage(ADMIN_CHAT_ID, `حدث خطأ:\n${error}`);
      }
    }
  });
}

module.exports = runTgBot;
