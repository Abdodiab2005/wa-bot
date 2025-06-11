// file: scheduler.js
const cron = require("node-cron");
const fs = require("fs");
const schedulePath = "./config/schedule.json";
const logger = require("./utils/logger");
const { clearOldMessages } = require("./utils/storage.js"); // استيراد الدالة الجديدة
const clearOldMesgsTime = "0 0 */2 * *"; // مرة كل يومين

function getScheduledJobs() {
  if (!fs.existsSync(schedulePath)) return [];
  return JSON.parse(fs.readFileSync(schedulePath));
}

function saveScheduledJobs(jobs) {
  fs.writeFileSync(schedulePath, JSON.stringify(jobs, null, 2));
}

// This function will start all pending jobs when the bot starts

// A map to keep track of running cron tasks so we can stop them
const runningTasks = new Map();

function initializeScheduledJobs(sock) {
  const jobs = getScheduledJobs();
  logger.info(`[Scheduler] Initializing ${jobs.length} total jobs...`);

  jobs.forEach((job) => {
    if (job.status === "active" || job.status === "pending") {
      scheduleNewJob(sock, job);
    }
  });

  cron.schedule(clearOldMesgsTime, () => {
    logger.info("[Scheduler] Running hourly cleanup task for message cache...");
    clearOldMessages();
  });
}

function scheduleNewJob(sock, job) {
  let cronTime = "";
  if (job.type === "recurring") {
    cronTime = job.cronString;
  } else {
    // One-time job
    const jobDate = new Date(job.date);
    if (jobDate < new Date()) {
      // Mark old one-time jobs as 'expired'
      updateJobStatus(job.id, "expired");
      return;
    }
    cronTime = `${jobDate.getMinutes()} ${jobDate.getHours()} ${jobDate.getDate()} ${
      jobDate.getMonth() + 1
    } *`;
  }

  const task = cron.schedule(
    cronTime,
    async () => {
      logger.info(
        `[Scheduler] Executing job ${job.id}: Sending message to ${job.targetJid}`
      );
      await sock.sendMessage(job.targetJid, {
        text: `*رسالة مجدولة 🗓️*\n\n${job.message}`,
      });

      if (job.type === "once") {
        updateJobStatus(job.id, "sent");
        task.stop(); // Stop the task after it runs once
        runningTasks.delete(job.id);
      }
    },
    {
      scheduled: true,
      timezone: "Africa/Cairo",
    }
  );

  runningTasks.set(job.id, task);
  logger.info(`[Scheduler] Job ${job.id} is now scheduled.`);
}

function deleteScheduledJob(jobId) {
  // Stop the running cron task if it exists
  if (runningTasks.has(jobId)) {
    runningTasks.get(jobId).stop();
    runningTasks.delete(jobId);
  }

  // Remove the job from the JSON file
  let jobs = getScheduledJobs();
  jobs = jobs.filter((job) => job.id !== jobId);
  saveScheduledJobs(jobs);

  logger.info(`[Scheduler] Deleted job ${jobId}.`);
  return true;
}

function updateJobStatus(jobId, status) {
  const jobs = getScheduledJobs();
  const jobIndex = jobs.findIndex((j) => j.id === jobId);
  if (jobIndex !== -1) {
    jobs[jobIndex].status = status;
    saveScheduledJobs(jobs);
  }
}

module.exports = {
  initializeScheduledJobs,
  scheduleNewJob,
  getScheduledJobs,
  saveScheduledJobs,
  deleteScheduledJob,
};
