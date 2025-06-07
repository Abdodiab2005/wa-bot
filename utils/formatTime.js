// A helper function to convert 24-hour format to 12-hour format with Arabic AM/PM
function formatTime12Hour(time24) {
  // Split the time string (e.g., "19:05") into hours and minutes
  const [hours, minutes] = time24.split(":");

  // Convert hours to a number
  let h = parseInt(hours, 10);

  // Determine the period (AM/PM) in Arabic
  const period = h >= 12 ? "م" : "ص"; // م for مساءً, ص for صباحًا

  // Convert hours to 12-hour format
  // 13 -> 1, 14 -> 2, etc.
  h = h % 12;

  // The hour '0' should be '12'
  h = h ? h : 12;

  // Return the formatted time string
  return `${h}:${minutes} ${period}`;
}
// A new helper function to add minutes to a "HH:mm" time string
function addMinutesToTime(time24, minutesToAdd) {
  // Split the time string into hours and minutes
  const [hours, minutes] = time24.split(":").map(Number);

  // Create a Date object. We only care about the time part.
  // We can use a fixed date like today.
  const date = new Date();
  date.setHours(hours, minutes, 0, 0); // Set the time from the input

  // Add the minutes. The Date object will handle hour and day rollovers automatically.
  date.setMinutes(date.getMinutes() + minutesToAdd);

  // Get the new hours and minutes
  const newHours = String(date.getHours()).padStart(2, "0");
  const newMinutes = String(date.getMinutes()).padStart(2, "0");

  // Return the new time in "HH:mm" format
  return `${newHours}:${newMinutes}`;
}
module.exports = {
  formatTime12Hour,
  addMinutesToTime,
};
