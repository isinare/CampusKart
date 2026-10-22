const { EventEmitter } = require("events");
const fs = require("fs");
const path = require("path");

/*
 * Application event bus (Node.js "events" syllabus topic).
 *
 * Critical state changes are always written to MongoDB first. Events are
 * notifications for non-critical side effects (audit log, future e-mail or
 * websocket push). Listeners are deliberately idempotent and never throw back
 * into the HTTP request.
 */
const bus = new EventEmitter();
bus.setMaxListeners(20);

const TOPIC = {
  createItem: "listing.created",
  updateItem: "listing.updated",
  withdrawItem: "listing.withdrawn",
  sendRequest: "request.created",
  decideRequest: "request.decided",
  respondCounter: "request.counter_answered",
  markSold: "sale.completed",
  rate: "rating.created",
  createBundle: "bundle.created",
  withdrawBundle: "bundle.withdrawn",
  createRental: "rental.created",
  requestRental: "rental.requested",
  decideRental: "rental.decided",
  handoverRental: "rental.handed_over",
  returnRental: "rental.returned",
  verifyStudent: "student.verified",
  resolveReport: "report.resolved",
  reviewFlag: "fraud.reviewed",
  deleteAccount: "account.deleted",
};

const logDir = path.join(__dirname, "..", "..", "logs");
const logFile = path.join(logDir, "events.log");

function writeAuditLine(line) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFile(logFile, line + "\n", () => {});
  } catch {
    /* logging must never break a request */
  }
}

bus.on("app.event", (event) => {
  writeAuditLine(JSON.stringify(event));
});

function publish(action, value, session) {
  const topic = TOPIC[action];
  if (!topic) return;
  const payload = value && value.body !== undefined ? value.body : value;
  const event = {
    id: `${action}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    topic,
    action,
    user_id: session ? session.userId : null,
    role: session ? session.role : null,
    at: new Date().toISOString(),
    value: payload && typeof payload === "object" ? payload : { result: payload },
  };
  bus.emit(topic, event);
  bus.emit("app.event", event);
}

bus.on("sale.completed", (e) => {
  console.log(`[event] sale completed by ${e.user_id}`);
});
bus.on("rental.returned", (e) => {
  console.log(`[event] rental returned by ${e.user_id}`);
});
bus.on("student.verified", (e) => {
  console.log(`[event] student verified by ${e.user_id}`);
});

module.exports = { bus, publish, TOPIC };
