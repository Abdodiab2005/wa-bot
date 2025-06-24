const fs = require("fs");
const path = require("path");
const pino = require("pino");
const rfs = require("rotating-file-stream");

// Create logs directory if it doesn't exist
const logDir = path.join(__dirname, "..", "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Create rotating streams
const combinedStream = rfs.createStream("combined.log", {
  interval: "1d", // rotate daily
  path: logDir,
});

const errorStream = rfs.createStream("error.log", {
  interval: "1d",
  path: logDir,
});

// Pretty console logger
const prettyTransport = {
  target: "pino-pretty",
  options: {
    colorize: true,
    translateTime: "SYS:dd-mm-yyyy HH:MM:ss",
    ignore: "pid,hostname",
  },
};

// Logger instance with multiple transports
const transport = pino.transport({
  targets: [
    {
      target: "pino/file",
      level: "trace",
      options: {
        destination: path.join(__dirname, "../logs/combined.log"),
      },
    },
    {
      target: "pino/file",
      level: "error",
      options: {
        destination: path.join(__dirname, "../logs/error.log"),
      },
    },
    {
      target: "pino-pretty",
      level: "info",
      options: {
        colorize: true,
        translateTime: "SYS:dd-mm-yyyy HH:MM:ss",
        ignore: "pid,hostname",
      },
    },
  ],
});

const logger = pino(transport);

module.exports = logger;
