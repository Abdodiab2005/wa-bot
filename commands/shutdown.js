// file: /commands/shutdown.js (Now with shell command execution)
const { delay } = require("@whiskeysockets/baileys");
const { exec } = require("child_process"); // 1. Import the 'exec' function
const logger = require("../utils/logger.js");

module.exports = {
  name: "shutdown",
  description: "Stops the bot process permanently using PM2.",
  chat: "all",

  async execute(sock, msg) {
    const commandToExecute = "pm2 stop wa-bot"; // The exact command to run on the server

    logger.warn(`Received !shutdown command. Executing: ${commandToExecute}`);

    // 2. Send a final message to the user before shutting down
    await sock.sendMessage(msg.key.remoteJid, {
      text: "🔌 تم استلام أمر الإيقاف النهائي. سيتم إيقاف البوت الآن... وداعًا! 👋",
    });

    // A small delay to ensure the WhatsApp message is sent out
    await delay(2000);

    // 3. Execute the shell command
    exec(commandToExecute, (error, stdout, stderr) => {
      if (error) {
        // This log is crucial if something goes wrong
        logger.error(
          {
            err: error.message,
            stderr: stderr,
          },
          `Failed to execute shutdown command: ${commandToExecute}`
        );

        // We can't reliably send a message here because the process might be stopping.
        return;
      }

      // This log will appear just before the process is stopped by PM2
      logger.info(`PM2 stop command executed successfully. STDOUT: ${stdout}`);
    });
  },
};
