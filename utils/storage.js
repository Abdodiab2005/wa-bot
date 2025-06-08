// file: /utils/storage.js
const db = require("../config/db.js"); // Import the database connection
const logger = require("../utils/logger");

/**
 * Gets the settings for a specific group from the database.
 * @param {string} groupId - The ID of the group.
 * @returns {object} The settings object for the group.
 */
function getGroupSettings(groupId) {
  const query = db.prepare(
    "SELECT settings FROM group_settings WHERE group_id = ?"
  );
  const row = query.get(groupId);

  if (row && row.settings) {
    return JSON.parse(row.settings); // Parse the JSON string back into an object
  } else {
    return {}; // Return a default empty object if not found
  }
}

/**
 * Saves or updates the settings for a specific group in the database.
 * @param {string} groupId - The ID of the group.
 * @param {object} settings - The settings object to save.
 */
function saveGroupSettings(groupId, settings) {
  // This query will insert a new row or replace the existing one if the group_id already exists.
  const query = db.prepare(
    "INSERT OR REPLACE INTO group_settings (group_id, settings) VALUES (?, ?)"
  );
  // We must stringify the settings object to store it in a TEXT column.
  query.run(groupId, JSON.stringify(settings));
}

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

/**
 * Gets the to-do list for a specific user.
 * @param {string} userId - The JID of the user.
 * @returns {string[]} An array of tasks.
 */
function getUserTodos(userId) {
  const query = db.prepare("SELECT tasks FROM todos WHERE user_id = ?");
  const row = query.get(userId);
  // If a record is found, parse the JSON string back into an array. Otherwise, return an empty array.
  return row ? JSON.parse(row.tasks) : [];
}

/**
 * Saves the to-do list for a specific user.
 * @param {string} userId - The JID of the user.
 * @param {string[]} tasksArray - The array of tasks to save.
 */
function saveUserTodos(userId, tasksArray) {
  const query = db.prepare(
    "INSERT OR REPLACE INTO todos (user_id, tasks) VALUES (?, ?)"
  );
  // We must stringify the tasks array to store it in a TEXT column.
  query.run(userId, JSON.stringify(tasksArray));
}

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
  // .all() returns an array of objects, so we use .map() to get just the keywords
  const rows = query.all(groupId);
  return rows.map((row) => row.keyword);
}

function deleteNote(groupId, keyword) {
  const query = db.prepare(
    "DELETE FROM notes WHERE group_id = ? AND keyword = ?"
  );
  // .run() returns an info object with a 'changes' property
  const info = query.run(groupId, keyword);
  return info.changes > 0; // Returns true if a row was deleted, false otherwise
}

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
}

// We will add more functions here later for notes, warnings, etc.
module.exports = {
  getGroupSettings,
  saveGroupSettings,
  getUserWarnings,
  saveUserWarnings,
  clearUserWarnings,
  getUserTodos,
  saveUserTodos,
  saveNote,
  getNote,
  getAllNotes,
  deleteNote,
  getChatHistory,
  saveChatHistory,
  deleteChatHistory,
  deleteAllChatHistories,
};
