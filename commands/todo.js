// file: /commands/todo.js
const fs = require("fs");
const path = "./config/todos.json";

// Helper function to read the todos file
function getTodos() {
  // If the file doesn't exist, create it with an empty object
  if (!fs.existsSync(path)) {
    fs.writeFileSync(path, JSON.stringify({}));
  }
  return JSON.parse(fs.readFileSync(path));
}

// Helper function to save the todos file
function saveTodos(todos) {
  fs.writeFileSync(path, JSON.stringify(todos, null, 2));
}

module.exports = {
  name: "todo",
  description: "Manages your personal to-do list.",
  chat: "all", // Can be used in groups or private chat

  async execute(sock, msg, args) {
    const senderId = msg.key.participant || msg.key.remoteJid;
    const subCommand = args[0] ? args[0].toLowerCase() : "list"; // Default to 'list' if no subcommand
    const todos = getTodos();

    // Initialize a list for the user if they don't have one
    if (!todos[senderId]) {
      todos[senderId] = [];
    }

    const userTasks = todos[senderId];

    switch (subCommand) {
      case "add":
        const taskToAdd = args.slice(1).join(" ");
        if (!taskToAdd) {
          return await sock.sendMessage(senderId, {
            text: "يرجى كتابة المهمة التي تريد إضافتها.",
          });
        }
        userTasks.push(taskToAdd);
        saveTodos(todos);
        await sock.sendMessage(senderId, {
          text: `✅ تمت إضافة المهمة:\n*${taskToAdd}*`,
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
          return await sock.sendMessage(senderId, {
            text: "رقم المهمة غير صالح. يرجى إرسال رقم صحيح من القائمة.",
          });
        }
        // Subtract 1 because arrays are 0-indexed
        const removedTask = userTasks.splice(taskNumber - 1, 1);
        saveTodos(todos);
        await sock.sendMessage(senderId, {
          text: `☑️ تم حذف المهمة:\n*${removedTask[0]}*`,
        });
        break;

      case "list":
      default:
        if (userTasks.length === 0) {
          return await sock.sendMessage(senderId, {
            text: "قائمة مهامك فارغة. أضف مهمة جديدة باستخدام:\n`!todo add <مهمتك>`",
          });
        }

        let reply = "*📋 قائمة مهامك الحالية:*\n\n";
        userTasks.forEach((task, index) => {
          reply += `${index + 1}. ${task}\n`;
        });
        reply += "\nلحذف مهمة، استخدم: `!todo remove <رقم المهمة>`";

        await sock.sendMessage(senderId, { text: reply });
        break;
    }
  },
};
