// file: /commands/todo.js (Corrected Reply Logic)
const { getUserTodos, saveUserTodos } = require("../utils/storage.js");
const logger = require("../utils/logger");
const normalizeJid = require("../utils/normalizeJid");

module.exports = {
  name: "todo",
  description: "Manages your personal to-do list.",
  chat: "all",

  async execute(sock, msg, args) {
    try {
      const senderId = normalizeJid(msg.key.participant || msg.key.remoteJid);
      const remoteJid = msg.key.remoteJid; // The chat where the command was sent
      const subCommand = args[0] ? args[0].toLowerCase() : "list";

      const userTasks = getUserTodos(senderId);

      switch (subCommand) {
        case "add":
          const taskToAdd = args.slice(1).join(" ");
          if (!taskToAdd) {
            return await sock.sendMessage(remoteJid, {
              text: "يرجى كتابة المهمة التي تريد إضافتها.",
            });
          }
          userTasks.push(taskToAdd);
          saveUserTodos(senderId, userTasks);
          await sock.sendMessage(remoteJid, {
            text: `✅ يا @${senderId.split("@")[0]}، تمت إضافة المهمة لقائمتك.`,
            mentions: [senderId],
          });
          break;

        case "remove":
        case "del":
          const taskNumber = parseInt(args[1], 10);
          if (
            isNaN(taskNumber) ||
            taskNumber <= 0 ||
            taskNumber > userTasks.length
          ) {
            return await sock.sendMessage(remoteJid, {
              text: "رقم المهمة غير صالح.",
            });
          }
          const removedTask = userTasks.splice(taskNumber - 1, 1);
          saveUserTodos(senderId, userTasks);
          await sock.sendMessage(remoteJid, {
            text: `☑️ يا @${senderId.split("@")[0]}، تم حذف المهمة: *${
              removedTask[0]
            }*`,
            mentions: [senderId],
          });
          break;

        case "list":
        default:
          if (userTasks.length === 0) {
            return await sock.sendMessage(remoteJid, {
              text: `قائمة مهامك فارغة يا @${senderId.split("@")[0]}.`,
              mentions: [senderId],
            });
          }

          let reply = `*📋 قائمة مهامك يا @${senderId.split("@")[0]}:*\n\n`;
          userTasks.forEach((task, index) => {
            reply += `${index + 1}. ${task}\n`;
          });

          await sock.sendMessage(remoteJid, {
            text: reply,
            mentions: [senderId],
          });
          break;
      }
    } catch (error) {
      logger.error(
        { err: error, command: "todo" },
        "An error occurred in the todo command"
      );
      await sock.sendMessage(msg.key.remoteJid, {
        text: "حدث خطأ أثناء معالجة قائمة المهام.",
      });
    }
  },
};
