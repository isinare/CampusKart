const { EventEmitter } = require("events");
const nodemailer = require("nodemailer");
const config = require("./config");
const { col } = require("./db");

/*
 * Optional e-mail notifications (syllabus Unit 3: "create a Node.js application
 * that automates sending emails"). The original Java application does not send
 * mail, so nothing here changes the UI or the API. When SMTP is not configured
 * the events are simply ignored and the API behaves exactly as before.
 *
 * A tiny event bus keeps the request handlers fast: they emit a "mail" event and
 * the listener talks to SMTP in the background, so a slow mail server can never
 * delay or break a CampusKart response.
 */
const bus = new EventEmitter();
let transport = null;

function enabled() {
  return Boolean(config.smtp.host && config.smtp.from);
}

function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transport;
}

bus.on("mail", async (job) => {
  if (!enabled()) return;
  try {
    await getTransport().sendMail({
      from: config.smtp.from,
      to: job.to,
      subject: job.subject,
      text: job.text,
    });
    console.log("[mail] sent to", job.to, "-", job.subject);
  } catch (error) {
    console.error("[mail] could not send to", job.to, "-", error.message);
  }
});

/**
 * Sends an e-mail to a CampusKart user if SMTP is configured.
 * Never throws: callers use it as a fire-and-forget side effect.
 */
async function notify(userId, subject, text) {
  if (!enabled() || !userId) return false;
  try {
    const user = await col("users").findOne(
      { U_ID: userId },
      { projection: { U_Email: 1, U_IsActive: 1 } }
    );
    if (!user || !user.U_Email || String(user.U_Email).indexOf("campuskart.invalid") >= 0) return false;
    bus.emit("mail", { to: user.U_Email, subject, text });
    return true;
  } catch (error) {
    console.error("[mail] lookup failed for", userId, "-", error.message);
    return false;
  }
}

module.exports = { notify, enabled };
