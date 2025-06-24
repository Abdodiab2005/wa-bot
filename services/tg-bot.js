// telegram-instance.js
const TelegramBot = require("node-telegram-bot-api");

const tgBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true,
});

module.exports = tgBot;
