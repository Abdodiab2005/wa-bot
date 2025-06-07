// file: /utils/logger.js
const pino = require("pino");

// This configuration sets up two destinations (transports) for our logs
const transport = pino.transport({
  targets: [
    {
      // Target 1: Log to the console with pretty, human-readable formatting
      target: "pino-pretty",
      options: {
        colorize: true, // Add colors
        translateTime: "SYS:dd-mm-yyyy HH:MM:ss", // A nice timestamp format
        ignore: "pid,hostname", // Don't show process ID and hostname
      },
    },
    {
      // Target 2: Log to a file in standard JSON format
      target: "pino/file",
      level: "trace", // Log everything to the file, even debug messages
      options: {
        destination: `./bot.log`, // The log file will be created in the root directory
      },
    },
  ],
});

// Create and export the logger instance
const logger = pino(transport);

module.exports = logger;
