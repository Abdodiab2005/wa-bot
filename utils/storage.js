// file: /utils/storage.js
const fs = require("fs");
const logger = require("../utils/logger.js");

/**
 * Reads and parses a JSON file.
 * If the file doesn't exist, it creates it with a default value.
 * @param {string} filePath - The path to the JSON file.
 * @param {any} defaultValue - The default value to use if the file doesn't exist (e.g., {} or []).
 * @returns {any} The parsed JSON data.
 */
function readJSON(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } else {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
      return defaultValue;
    }
  } catch (error) {
    logger.error(`Error reading or parsing JSON file at ${filePath}:`, error);
    return defaultValue;
  }
}

/**
 * Writes data to a JSON file.
 * @param {string} filePath - The path to the JSON file.
 * @param {any} data - The data to write to the file.
 */
function writeJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    logger.error(`Error writing JSON file at ${filePath}:`, error);
  }
}

module.exports = { readJSON, writeJSON };
