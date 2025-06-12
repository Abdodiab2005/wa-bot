const {
  getAllBooks,
  saveBook,
  deleteBook,
  getBook,
} = require("../utils/storage.js");
const logger = require("../utils/logger");
const normalizeJid = require("../utils/normalizeJid");
const { v4: uuidv4 } = require("uuid");

module.exports = {
  name: "books",
  description: "Manages books list.",
  chat: "all",

  async execute(sock, msg, args) {
    try {
      const senderId = normalizeJid(msg.key.participant || msg.key.remoteJid);
      const remoteJid = msg.key.remoteJid;
      const subCommand = args[0] ? args[0].toLowerCase() : "list";

      switch (subCommand) {
        case "add": {
          const input = args.slice(1).join(" ");
          const match = input.match(/#"(.*?)"\s+(https?:\/\/\S+)/);
          if (!match) {
            return await sock.sendMessage(remoteJid, {
              text: '❌ الصيغة غير صحيحة. استخدم: `!books add #"اسم الكتاب" الرابط`',
            });
          }

          const title = match[1].trim();
          const link = match[2].trim();
          const bookId = uuidv4();
          saveBook(bookId, title, link);

          await sock.sendMessage(remoteJid, {
            text: `✅ تم إضافة الكتاب: *${title}*`,
            mentions: [senderId],
          });
          break;
        }

        case "delete":
        case "del": {
          const allBooks = getAllBooks();
          const index = parseInt(args[1]?.replace("#", ""), 10);
          if (isNaN(index) || index < 0 || index >= allBooks.length) {
            return await sock.sendMessage(remoteJid, {
              text: "❌ رقم الكتاب غير صالح.",
            });
          }

          const book = allBooks[index];
          deleteBook(book.book_id);

          await sock.sendMessage(remoteJid, {
            text: `🗑️ تم حذف الكتاب: *${book.title}*`,
            mentions: [senderId],
          });
          break;
        }

        case "get": {
          const query = args.slice(1).join(" ");
          const getMatch = query.match(/#"(.*?)"/);
          if (!getMatch) {
            return await sock.sendMessage(remoteJid, {
              text: '❌ يرجى استخدام: `!books get #"اسم الكتاب"`',
            });
          }

          const title = getMatch[1].trim();
          const allBooks = getAllBooks();
          const book = allBooks.find((b) => b.title === title);
          if (!book) {
            return await sock.sendMessage(remoteJid, {
              text: `📕 لم يتم العثور على الكتاب: *${title}*`,
            });
          }

          await sock.sendMessage(remoteJid, {
            text: `🔗 رابط الكتاب *${book.title}*:\n${book.link}`,
          });
          break;
        }

        case "edit": {
          const input = args.slice(1).join(" ");
          const match = input.match(/#"(.*?)"\s+#"(.*?)"\s+(https?:\/\/\S+)/);
          if (!match) {
            return await sock.sendMessage(remoteJid, {
              text: '❌ الصيغة غير صحيحة.\nاستخدم: `!books edit #"الاسم القديم" #"الاسم الجديد" الرابط الجديد`',
            });
          }

          const oldTitle = match[1].trim();
          const newTitle = match[2].trim();
          const newLink = match[3].trim();

          const allBooks = getAllBooks();
          const book = allBooks.find((b) => b.title === oldTitle);
          if (!book) {
            return await sock.sendMessage(remoteJid, {
              text: `📕 لم يتم العثور على الكتاب: *${oldTitle}*`,
            });
          }

          saveBook(book.book_id, newTitle, newLink);

          await sock.sendMessage(remoteJid, {
            text: `✏️ تم تعديل الكتاب *${oldTitle}* إلى *${newTitle}*.\nالرابط الجديد: ${newLink}`,
            mentions: [senderId],
          });
          break;
        }

        case "list":
        default: {
          const allBooks = getAllBooks();
          if (allBooks.length === 0) {
            return await sock.sendMessage(remoteJid, {
              text: `📚 قائمة الكتب فارغة يا @${senderId.split("@")[0]}.`,
              mentions: [senderId],
            });
          }

          let reply = `*📚 قائمة الكتب:*\n\n`;
          allBooks.forEach((book, index) => {
            reply += `#${index} - *${book.title}*\n`;
          });

          await sock.sendMessage(remoteJid, {
            text: reply,
            mentions: [senderId],
          });
          break;
        }
      }
    } catch (error) {
      logger.error({ err: error, command: "books" }, "Books Command Error");
      await sock.sendMessage(msg.key.remoteJid, {
        text: "❌ حدث خطأ أثناء تنفيذ الأمر.",
      });
    }
  },
};
