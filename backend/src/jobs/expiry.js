const rules = require("../../rules");

/*
 * Background maintenance job. The original MySQL implementation used an
 * explicit sweep/trigger; MongoDB runs the same rule from a small timer.
 * The database is the source of truth, so a missed tick cannot lose data: the
 * next request also runs `rules.runSweep()` before reading request lists.
 */
function startExpiryJob(intervalMs = 60 * 60 * 1000) {
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      const expired = await rules.runSweep();
      if (expired) {
        console.log(`[job] expired ${expired} stale request(s)`);
      }
    } catch (error) {
      console.error("[job] expiry sweep failed:", error.message);
    } finally {
      running = false;
    }
  }

  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return timer;
}

module.exports = { startExpiryJob };
