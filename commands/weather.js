// file: /commands/weather.js

const axios = require("axios");
const logger = require("../utils/logger");

// 🔰 ضع مفتاح الـ API الخاص بك هنا
const API_KEY = process.env.OPENWEATHERMAP_API_KEY;

module.exports = {
  name: "weather",
  description: "Gets the current weather for a specific city.",
  chat: "all",

  async execute(sock, msg, args) {
    if (!args || args.length === 0) {
      return await sock.sendMessage(msg.key.remoteJid, {
        text: "يرجى تقديم اسم المدينة باللغة الانجليزية.\n\n*مثال:* `!weather cairo`",
      });
    }

    const city = args.join(" ");

    // URL الخاص بـ OpenWeatherMap للحصول على الطقس الحالي
    // - units=metric للحصول على درجة الحرارة بالسيليزيوس
    // - lang=ar للحصول على الوصف باللغة العربية
    const API_URL = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric&lang=ar`;

    try {
      await sock.sendMessage(msg.key.remoteJid, {
        text: `جاري البحث عن طقس مدينة ${city}...`,
      });

      const response = await axios.get(API_URL);
      const weatherData = response.data;

      // استخلاص البيانات المهمة من الرد
      const weatherDescription = weatherData.weather[0].description;
      const currentTemp = weatherData.main.temp;
      const feelsLike = weatherData.main.feels_like;
      const humidity = weatherData.main.humidity;
      const windSpeed = weatherData.wind.speed;

      // تنسيق رسالة الرد مع الأيقونات
      const reply =
        `*حالة الطقس في مدينة ${city}:*\n\n` +
        `🌤️ الوصف: ${weatherDescription}\n` +
        `🌡️ درجة الحرارة: ${currentTemp}°C\n` +
        `🤔 الإحساس الفعلي: ${feelsLike}°C\n` +
        `💧 الرطوبة: ${humidity}%\n` +
        `🌬️ سرعة الرياح: ${windSpeed} متر/ثانية`;

      await sock.sendMessage(msg.key.remoteJid, { text: reply });
    } catch (error) {
      // التعامل مع الأخطاء
      if (error.response && error.response.status === 404) {
        // خطأ 404 يعني أن المدينة غير موجودة
        await sock.sendMessage(msg.key.remoteJid, {
          text: `لم أتمكن من العثور على مدينة باسم "${city}". يرجى التحقق من الاسم.`,
        });
      } else if (error.response && error.response.status === 401) {
        // خطأ 401 يعني أن مفتاح الـ API غير صالح
        logger.error("[Error] Invalid API Key for OpenWeatherMap.");
        await sock.sendMessage(msg.key.remoteJid, {
          text: `حدث خطأ في المصادقة مع خدمة الطقس. يرجى مراجعة مفتاح الـ API.`,
        });
      } else {
        // أي أخطاء أخرى
        logger.error("[Error] in Weather API:", error.message);
        await sock.sendMessage(msg.key.remoteJid, {
          text: `عذرًا، حدث خطأ أثناء جلب بيانات الطقس.`,
        });
      }
    }
  },
};
