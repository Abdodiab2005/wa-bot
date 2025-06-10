// file: /utils/storage.js
const db = require("../config/db.js"); // Using the path you specified

// =================================================================
// --- Group Settings Functions ---
// =================================================================

/**
 * Gets the settings for a specific group from the database.
 * @param {string} groupId - The ID of the group.
 * @returns {object} The settings object for the group, or an empty object if not found.
 */
function getGroupSettings(groupId) {
  const query = db.prepare(
    "SELECT settings FROM group_settings WHERE group_id = ?"
  );
  const row = query.get(groupId);
  return row ? JSON.parse(row.settings) : {};
}

/**
 * Saves or updates the settings for a specific group in the database.
 * @param {string} groupId - The ID of the group.
 * @param {object} settings - The settings object to save.
 */
function saveGroupSettings(groupId, settings) {
  const query = db.prepare(
    "INSERT OR REPLACE INTO group_settings (group_id, settings) VALUES (?, ?)"
  );
  query.run(groupId, JSON.stringify(settings));
}

// =================================================================
// --- Warnings Functions ---
// =================================================================

function getUserWarnings(groupId, userId) {
  const query = db.prepare(
    "SELECT warnings_data FROM warnings WHERE group_id = ? AND user_id = ?"
  );
  const row = query.get(groupId, userId);
  return row ? JSON.parse(row.warnings_data) : [];
}

function saveUserWarnings(groupId, userId, warningsArray) {
  const query = db.prepare(
    "INSERT OR REPLACE INTO warnings (group_id, user_id, warnings_data) VALUES (?, ?, ?)"
  );
  query.run(groupId, userId, JSON.stringify(warningsArray));
}

function clearUserWarnings(groupId, userId) {
  const query = db.prepare(
    "DELETE FROM warnings WHERE group_id = ? AND user_id = ?"
  );
  query.run(groupId, userId);
}

// =================================================================
// --- To-Do List Functions ---
// =================================================================

function getUserTodos(userId) {
  const query = db.prepare("SELECT tasks FROM todos WHERE user_id = ?");
  const row = query.get(userId);
  return row ? JSON.parse(row.tasks) : [];
}

function saveUserTodos(userId, tasksArray) {
  const query = db.prepare(
    "INSERT OR REPLACE INTO todos (user_id, tasks) VALUES (?, ?)"
  );
  query.run(userId, JSON.stringify(tasksArray));
}

// =================================================================
// --- Group Notes Functions ---
// =================================================================

function saveNote(groupId, keyword, text) {
  const query = db.prepare(
    "INSERT OR REPLACE INTO notes (group_id, keyword, note_text) VALUES (?, ?, ?)"
  );
  query.run(groupId, keyword, text);
}

function getNote(groupId, keyword) {
  const query = db.prepare(
    "SELECT note_text FROM notes WHERE group_id = ? AND keyword = ?"
  );
  const row = query.get(groupId, keyword);
  return row ? row.note_text : null;
}

function getAllNotes(groupId) {
  const query = db.prepare("SELECT keyword FROM notes WHERE group_id = ?");
  const rows = query.all(groupId);
  return rows.map((row) => row.keyword);
}

function deleteNote(groupId, keyword) {
  const query = db.prepare(
    "DELETE FROM notes WHERE group_id = ? AND keyword = ?"
  );
  const info = query.run(groupId, keyword);
  return info.changes > 0; // Returns true if a row was deleted
}

// =================================================================
// --- AI Chat History Functions ---
// =================================================================

function getChatHistory(chatId) {
  const query = db.prepare("SELECT history FROM ai_history WHERE chat_id = ?");
  const row = query.get(chatId);
  return row ? JSON.parse(row.history) : [];
}

function saveChatHistory(chatId, historyArray) {
  const query = db.prepare(
    "INSERT OR REPLACE INTO ai_history (chat_id, history) VALUES (?, ?)"
  );
  query.run(chatId, JSON.stringify(historyArray));
}

function deleteChatHistory(chatId) {
  const query = db.prepare("DELETE FROM ai_history WHERE chat_id = ?");
  return query.run(chatId).changes > 0;
}

function deleteAllChatHistories() {
  const query = db.prepare("DELETE FROM ai_history");
  query.run();
  logger.info("All AI chat histories have been deleted.");
}

// =================================================================
// --- Export All Functions ---
// =================================================================
module.exports = {
  // Group Settings
  getGroupSettings,
  saveGroupSettings,
  // Warnings
  getUserWarnings,
  saveUserWarnings,
  clearUserWarnings,
  // Todos
  getUserTodos,
  saveUserTodos,
  // Notes
  saveNote,
  getNote,
  getAllNotes,
  deleteNote,
  // AI History
  getChatHistory,
  saveChatHistory,
  deleteChatHistory,
  deleteAllChatHistories,
};
