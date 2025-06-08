// file: /utils/database.js
const Database = require("better-sqlite3");
const logger = require("../utils/logger");

// This will create a new file 'bot_database.db' in the root directory
// The { verbose: console.log } option is great for debugging during development
const db = new Database("bot_database.db", { verbose: console.log });

function initializeDatabase() {
  // This statement will create the table only if it does not exist.
  // We will store settings as a JSON string in the 'settings' column.
  const createSettingsTable = `
    CREATE TABLE IF NOT EXISTS group_settings (
        group_id TEXT PRIMARY KEY,
        settings TEXT NOT NULL
    );`;

  // Execute the statement
  db.exec(createSettingsTable);
  console.log("Database initialized and 'group_settings' table is ready.");

  const createWarningsTable = `
    CREATE TABLE IF NOT EXISTS warnings (
        group_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        warnings_data TEXT NOT NULL,
        PRIMARY KEY (group_id, user_id)
    );`;

  db.exec(createWarningsTable);
  logger.info("Table 'warnings' is ready.");

  const createTodosTable = `
    CREATE TABLE IF NOT EXISTS todos (
        user_id TEXT PRIMARY KEY,
        tasks TEXT NOT NULL
    );`;

  db.exec(createTodosTable);
  logger.info("Table 'todos' is ready.");

  const createNotesTable = `
    CREATE TABLE IF NOT EXISTS notes (
        group_id TEXT NOT NULL,
        keyword TEXT NOT NULL,
        note_text TEXT NOT NULL,
        PRIMARY KEY (group_id, keyword)
    );`;

  db.exec(createNotesTable);
  logger.info("Table 'notes' is ready.");

  const createAiHistoryTable = `
    CREATE TABLE IF NOT EXISTS ai_history (
        chat_id TEXT PRIMARY KEY,
        history TEXT NOT NULL
    );`;

  db.exec(createAiHistoryTable);
  logger.info("Table 'ai_history' is ready.");
}

// Call the initialization function
initializeDatabase();

// Export the database connection instance
module.exports = db;
