// file: /commands/shortlink.js

const axios = require("axios");
const logger = require("../utils/logger");

// A simple regex to validate if the input is a URL
const urlRegex = new RegExp(/^(https?:\/\/[^\s/$.?#].[^\s]*)$/i);

module.exports = {
  name: "shortlink",
  description: "Shortens a long URL using the is.gd service.",
  chat: "all", // This command can be used anywhere

  async execute(sock, msg, args) {
    // 1. Check if the user provided any arguments
    if (!args || args.length === 0) {
      return await sock.sendMessage(msg.key.remoteJid, {
        text: "يرجى إرسال الرابط الذي تريد اختصاره.\n\n*مثال:*\n`!shortlink https://github.com/WhiskeySockets/Baileys`",
      });
    }

    const longUrl = args[0];

    // 2. Validate if the provided argument is a valid URL
    if (!urlRegex.test(longUrl)) {
      return await sock.sendMessage(msg.key.remoteJid, {
        text: "الرابط الذي أرسلته غير صالح. يرجى التأكد من أنه يبدأ بـ `http://` أو `https://`.",
      });
    }

    // 3. Define the API endpoint for is.gd
    // We use `encodeURIComponent` to ensure the URL is properly formatted for the API request
    const API_URL = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(
      longUrl
    )}`;

    try {
      await sock.sendMessage(msg.key.remoteJid, {
        text: "جاري اختصار الرابط...",
      });

      // 4. Make the GET request to the API
      const response = await axios.get(API_URL);

      // 5. The API returns the shortened URL as plain text in the response body
      const shortUrl = response.data;

      const reply =
        `✅ تم اختصار الرابط بنجاح!\n\n` + `🔗 *الرابط المختصر:*\n${shortUrl}`;

      await sock.sendMessage(msg.key.remoteJid, { text: reply });
    } catch (error) {
      logger.error(
        "[Error] in !shortlink command:",
        error.response ? error.response.data : error.message
      );

      // The API returns a plain text error message if something goes wrong
      const errorMessage = error.response
        ? error.response.data
        : "حدث خطأ غير متوقع.";

      await sock.sendMessage(msg.key.remoteJid, {
        text: `*عذرًا، حدث خطأ:*\n\n` + `\`\`\`${errorMessage}\`\`\``,
      });
    }
  },
};
