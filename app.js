// file: app.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- إعدادات Express ---
const BOT_PASSWORD = process.env.BOT_PASSWORD || "default_password"; // A fallback password
const SESSION_SECRET = process.env.SESSION_SECRET || "default_secret"; // A fallback secret

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

// --- الراوتس (Routes) ---
app.get("/", (req, res) => {
  if (req.session.loggedIn) {
    res.render("dashboard");
  } else {
    res.render("login", { error: null });
  }
});

app.post("/login", (req, res) => {
  if (req.body.password === BOT_PASSWORD) {
    req.session.loggedIn = true;
    res.redirect("/");
  } else {
    res.render("login", { error: "Incorrect Password" });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// ✅ --- تصدير السيرفر و io ---
// نقوم بتصديرهم حتى يتمكن index.js من استخدامهم وتشغيلهم
module.exports = { server, io };
