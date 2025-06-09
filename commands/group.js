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
  chat: "group", // This command can only be used in groups
  // We remove userAdminRequired from here to allow per-sub-command checks

  async execute(sock, msg, args, body, groupMetadata, confirmationSessions) {
    const subCommandName = args.shift()?.toLowerCase();

    if (!subCommandName) {
      // You can build a help menu for the !group command here
      return await sock.sendMessage(msg.key.remoteJid, {
        text: "يرجى تحديد أمر فرعي بعد `!group` (مثل: kick, add, rules).",
      });
    }

    const subCommand = subCommands.get(subCommandName);

    if (!subCommand) {
      return await sock.sendMessage(msg.key.remoteJid, {
        text: `الأمر الفرعي \`${subCommandName}\` غير معروف.`,
      });
    }

    // --- ✅ ADVANCED PERMISSION CHECKING MOVED HERE ---
    const senderId = normalizeJid(msg.key.participant);
    const isOwner = config.owners.includes(senderId);
    const isSenderAdmin = groupMetadata.participants.some(
      (p) => ["admin", "superadmin"].includes(p.admin) && p.id === senderId
    );

    // Get permission level from config.json for the specific sub-command
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

    if (!hasPermission) {
      return await sock.sendMessage(msg.key.remoteJid, {
        text: "🚫 ليس لديك الصلاحية لاستخدام هذا الأمر.",
      });
    }

    // Now, check execution prerequisites defined in the sub-command file itself
    const isBotAdmin = groupMetadata.participants.some(
      (p) =>
        ["admin", "superadmin"].includes(p.admin) &&
        normalizeJid(p.id) === normalizeJid(sock.user.id)
    );

    if (subCommand.userAdminRequired && !isSenderAdmin) {
      return await sock.sendMessage(msg.key.remoteJid, {
        text: "⚠️ هذا الأمر مخصص للمشرفين فقط.",
      });
    }
    if (subCommand.botAdminRequired && !isBotAdmin) {
      return await sock.sendMessage(msg.key.remoteJid, {
        text: "⚠️ لا يمكنني تنفيذ هذا الأمر لأني لست مشرفًا.",
      });
    }

    // --- All checks passed, execute the sub-command ---
    try {
      await subCommand.execute(
        sock,
        msg,
        args,
        body,
        groupMetadata,
        confirmationSessions
      );
    } catch (error) {
      logger.error(
        { err: error, subCommand: subCommandName },
        "Error executing a group sub-command"
      );
    }
  },
};
