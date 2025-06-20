// file: /commands/group.js (The Final Advanced Router with Permissions)
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");
const config = require("../config/config.json");
const normalizeJid = require("../utils/normalizeJid.js");

// --- Sub-command Loader (This part is perfect as you wrote it) ---
const subCommands = new Map();
const subCommandsPath = path.join(__dirname, "group");
const subCommandFiles = fs
  .readdirSync(subCommandsPath)
  .filter((file) => file.endsWith(".js"));
for (const file of subCommandFiles) {
  try {
    const command = require(path.join(subCommandsPath, file));
    if (command.name) {
      subCommands.set(command.name, command);
      if (command.aliases && Array.isArray(command.aliases)) {
        command.aliases.forEach((alias) => subCommands.set(alias, command));
      }
    }
  } catch (error) {
    logger.error(
      { err: error, file: file },
      `Failed to load group sub-command from ${file}`
    );
  }
}

module.exports = {
  name: "group",
  description: "Main command for all group management actions.",
  chat: "group",

  async execute(sock, msg, args, body, groupMetadata) {
    const subCommandName = args.shift()?.toLowerCase();

    if (!subCommandName) {
      return await sock.sendMessage(msg.key.remoteJid, {
        text: "يرجى تحديد أمر فرعي بعد `!group`.",
      });
    }

    const subCommand = subCommands.get(subCommandName);
    if (!subCommand) {
      return await sock.sendMessage(msg.key.remoteJid, {
        text: `الأمر الفرعي \`${subCommandName}\` غير معروف.`,
      });
    }

    // --- ALL PERMISSION & PREREQUISITE LOGIC LIVES HERE ---
    const senderId = normalizeJid(msg.key.participant);
    const isOwner = config.owners.includes(senderId);
    const isSenderAdmin = groupMetadata.participants.some(
      (p) => ["admin", "superadmin"].includes(p.admin) && p.id === senderId
    );

    const groupPermissions = config.command_permissions.group;
    const permissionLevel =
      groupPermissions.sub_commands[subCommand.name] ||
      groupPermissions.default_permission;

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

    // Check prerequisites from the sub-command file itself
    const isBotAdmin = groupMetadata.participants.some((p) => {
      return (
        ["admin", "superadmin"].includes(p.admin) &&
        normalizeJid(p.id) === normalizeJid(sock.user.lid)
      );
    });
    if (subCommand.userAdminRequired && !isSenderAdmin)
      return await sock.sendMessage(msg.key.remoteJid, {
        text: "⚠️ هذا الأمر يتطلب أن تكون مشرفًا.",
      });
    if (subCommand.botAdminRequired && !isBotAdmin)
      return await sock.sendMessage(msg.key.remoteJid, {
        text: "⚠️ يجب أن أكون مشرفًا لتنفيذ هذا الأمر.",
      });

    try {
      await subCommand.execute(sock, msg, args, body, groupMetadata);
    } catch (error) {
      logger.error(
        { err: error, subCommand: subCommandName },
        "Error executing a group sub-command"
      );
    }
  },
};
