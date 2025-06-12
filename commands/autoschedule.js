const {
  scheduleNewJob,
  getScheduledJobs,
  saveScheduledJobs,
} = require("../scheduler.js");
const { v4: uuidv4 } = require("uuid"); // Use UUID for unique IDs

module.exports = {
  name: "autoschedule",
  description: "Schedules a recurring message (daily, weekly).",
  chat: "all",

  async execute(sock, msg, args) {
    const creatorJid = msg.key.participant || msg.key.remoteJid;
    const targetJid = msg.key.remoteJid;

    const type = args[0]?.toLowerCase();
    const time = args[1];
    const message = args.slice(2).join(" ");

    if (!type || !time || !message) {
      return await sock.sendMessage(creatorJid, {
        text: "الصيغة غير صحيحة. استخدم:\n`!autoschedule daily HH:mm رسالتك`\n`!autoschedule weekly day HH:mm رسالتك`",
      });
    }

    const [hour, minute] = time.split(":");
    let cronString = "";

    if (type === "daily") {
      cronString = `${minute} ${hour} * * *`;
    } else if (type === "weekly") {
      // This part can be enhanced later to support specific days like 'monday'
      // For now, let's keep it simple. Example: !autoschedule weekly 1 10:30 "..." for Monday 10:30
      const dayOfWeek = args[1];
      const weeklyTime = args[2];
      const weeklyMessage = args.slice(3).join(" ");
      // ... logic to build weekly cron string ...
      return await sock.sendMessage(creatorJid, {
        text: "جدولة أسبوعية قيد التطوير.",
      });
    } else {
      return await sock.sendMessage(creatorJid, {
        text: "النوع غير مدعوم. استخدم: `daily`",
      });
    }

    const newJob = {
      id: uuidv4(),
      type: "recurring",
      cronString: cronString,
      message: message,
      targetJid: targetJid,
      creatorJid: creatorJid,
      status: "active",
    };

    const jobs = getScheduledJobs();
    jobs.push(newJob);
    saveScheduledJobs(jobs);
    scheduleNewJob(sock, newJob);

    await sock.sendMessage(creatorJid, {
      text: `✅ تم جدولة رسالة يومية بنجاح في الساعة ${time}`,
    });
  },
};
// Note: You need to run `npm install uuid` for this command.
