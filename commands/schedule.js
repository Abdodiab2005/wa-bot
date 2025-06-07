// file: commands/schedule.js
const {
  scheduleNewJob,
  getScheduledJobs,
  saveScheduledJobs,
} = require("../scheduler.js");

module.exports = {
  name: "schedule",
  description: "Schedules a message to be sent in the future.",
  chat: "all",

  async execute(sock, msg, args) {
    const creatorJid = msg.key.participant || msg.key.remoteJid;
    const targetJid = msg.key.remoteJid;

    // We expect the format: !schedule "HH:mm DD-MM-YYYY" "Your message here"
    const commandBody = args.join(" ");
    const parts = commandBody.match(/(["'])(?:(?=(\\?))\2.)*?\1/g);

    if (!parts || parts.length < 2) {
      return await sock.sendMessage(creatorJid, {
        text: 'الصيغة غير صحيحة. يرجى استخدام:\n`!schedule "HH:mm DD-MM-YYYY" "رسالتك"`',
      });
    }

    const dateTimeString = parts[0].slice(1, -1);
    const message = parts[1].slice(1, -1);

    // Parse date and time: "22:30 07-06-2025"
    const [time, date] = dateTimeString.split(" ");
    const [hour, minute] = time.split(":");
    const [day, month, year] = date.split("-");

    const scheduleDate = new Date(year, month - 1, day, hour, minute);

    if (isNaN(scheduleDate.getTime()) || scheduleDate < new Date()) {
      return await sock.sendMessage(creatorJid, {
        text: "التاريخ أو الوقت غير صالح أو في الماضي. يرجى استخدام صيغة `HH:mm DD-MM-YYYY` بتاريخ مستقبلي.",
      });
    }

    const newJob = {
      id: Date.now().toString(),
      date: scheduleDate.toISOString(),
      message: message,
      targetJid: targetJid,
      creatorJid: creatorJid,
      status: "pending",
    };

    const jobs = getScheduledJobs();
    jobs.push(newJob);
    saveScheduledJobs(jobs);

    // Schedule the job to run in the current session
    scheduleNewJob(sock, newJob);

    await sock.sendMessage(creatorJid, {
      text: `✅ تم جدولة رسالتك بنجاح ليتم إرسالها في:\n*${scheduleDate.toLocaleString(
        "ar-EG",
        { timeZone: "Africa/Cairo" }
      )}*`,
    });
  },
};
