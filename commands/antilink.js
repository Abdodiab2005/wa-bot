// file: /commands/antilink.js
const fs = require("fs");
const settingsPath = "./config/group_settings.json";
const logger = require("../utils/logger.js");

// Helper function to read settings
function getSettings() {
  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, JSON.stringify({}));
  }
  return JSON.parse(fs.readFileSync(settingsPath));
}

// Helper function to write settings
function saveSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// --- The Main Command Logic ---
const command = {
  name: "antilink",
  description: "Advanced control for the anti-link feature.",
  chat: "group",
  userAdminRequired: true,

  async execute(sock, msg, args) {
    const groupId = msg.key.remoteJid;
    const subCommand = args[0] ? args[0].toLowerCase() : "status";
    const settings = getSettings();

    // Initialize settings for the group if it doesn't exist
    if (!settings[groupId] || !settings[groupId].antilink) {
      settings[groupId] = {
        antilink: {
          enabled: false,
          mode: "ALL",
          allowed_domains: [],
          blocked_domains: [],
        },
      };
    }

    const antilinkConfig = settings[groupId].antilink;

    switch (subCommand) {
      case "on":
        antilinkConfig.enabled = true;
        await sock.sendMessage(groupId, {
          text: "✅ تم تفعيل نظام منع الروابط.",
        });
        break;
      case "off":
        antilinkConfig.enabled = false;
        await sock.sendMessage(groupId, {
          text: "☑️ تم تعطيل نظام منع الروابط.",
        });
        break;
      case "mode":
        const mode = args[1] ? args[1].toUpperCase() : "";
        if (!["ALL", "WHITELIST", "BLACKLIST"].includes(mode)) {
          return await sock.sendMessage(groupId, {
            text: "الوضع غير صالح. الأوضاع المتاحة: `ALL`, `WHITELIST`, `BLACKLIST`",
          });
        }
        antilinkConfig.mode = mode;
        await sock.sendMessage(groupId, {
          text: `✅ تم تغيير وضع منع الروابط إلى: ${mode}`,
        });
        break;
      case "allow":
        const domainToAllow = args[1] ? args[1].toLowerCase() : "";
        if (!domainToAllow)
          return await sock.sendMessage(groupId, {
            text: "يرجى تحديد دومين للسماح به.",
          });
        if (!antilinkConfig.allowed_domains.includes(domainToAllow)) {
          antilinkConfig.allowed_domains.push(domainToAllow);
        }
        await sock.sendMessage(groupId, {
          text: `✅ تم إضافة '${domainToAllow}' إلى قائمة الدومينات المسموح بها.`,
        });
        break;
      case "disallow":
        const domainToDisallow = args[1] ? args[1].toLowerCase() : "";
        if (!domainToDisallow)
          return await sock.sendMessage(groupId, {
            text: "يرجى تحديد دومين لإزالته.",
          });
        antilinkConfig.allowed_domains = antilinkConfig.allowed_domains.filter(
          (d) => d !== domainToDisallow
        );
        await sock.sendMessage(groupId, {
          text: `☑️ تم إزالة '${domainToDisallow}' من قائمة الدومينات المسموح بها.`,
        });
        break;
      default:
        // Display current status
        let statusReply = `*حالة نظام منع الروابط:*\n\n`;
        statusReply += `الحالة: ${
          antilinkConfig.enabled ? "مفعل ✅" : "معطل ☑️"
        }\n`;
        statusReply += `الوضع: ${antilinkConfig.mode}\n`;
        statusReply += `الدومينات المسموح بها: ${
          antilinkConfig.allowed_domains.join(", ") || "لا يوجد"
        }\n`;
        await sock.sendMessage(groupId, { text: statusReply });
    }

    saveSettings(settings);
  },
};

// --- The Message Handler Logic ---
const linkRegex = new RegExp(
  /(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/[a-zA-Z0-9]+\.[^\s]{2,}|[a-zA-Z0-9]+\.[^\s]{2,})/i
);

async function handleAntiLink(sock, msg, config, normalizeJid) {
  const isGroup = msg.key.remoteJid.endsWith("@g.us");
  if (!isGroup) return;

  const groupId = msg.key.remoteJid;
  const settings = getSettings();
  const antilinkConfig = settings[groupId]?.antilink;

  // Stop if the feature is not enabled for this group
  if (!antilinkConfig || !antilinkConfig.enabled) return;

  const senderId = msg.key.participant || msg.key.remoteJid;

  // Check if the sender is an owner or admin
  const groupMetadata = await sock.groupMetadata(groupId);
  const isOwner = config.owners.includes(normalizeJid(senderId));
  const isSenderAdmin = groupMetadata.participants.some(
    (p) => ["admin", "superadmin"].includes(p.admin) && p.id === senderId
  );

  // Admins and Owners are immune
  if (isOwner || isSenderAdmin) return;

  const body =
    msg.message.conversation || msg.message.extendedTextMessage?.text || "";
  if (!linkRegex.test(body)) return; // No link found

  // --- Link Found, Apply Rules ---
  const foundLinks = body.match(linkRegex);
  const domain = new URL(
    foundLinks[0].startsWith("http") ? foundLinks[0] : `http://${foundLinks[0]}`
  ).hostname.replace("www.", "");

  let shouldDelete = false;

  switch (antilinkConfig.mode) {
    case "ALL":
      shouldDelete = true;
      break;
    case "WHITELIST":
      if (!antilinkConfig.allowed_domains.includes(domain)) {
        shouldDelete = true;
      }
      break;
    case "BLACKLIST":
      if (antilinkConfig.blocked_domains.includes(domain)) {
        shouldDelete = true;
      }
      break;
  }

  if (shouldDelete) {
    logger.info(
      `[Anti-Link] Deleting link from ${senderId} in ${groupId}. Domain: ${domain}`
    );
    await sock.sendMessage(groupId, { delete: msg.key });
    await sock.sendMessage(groupId, {
      text: `ممنوع إرسال الروابط هنا يا @${senderId.split("@")[0]}!`,
      mentions: [senderId],
    });
  }
}

// Export both the command and the handler
module.exports = { ...command, handleAntiLink };
