import { useEffect, useRef } from "react";
import { startLegacyApp } from "../legacy/app.js";

/**
 * Mounts the preserved CampusKart view layer inside the React tree.
 *
 * The original screens were written as a small hash-router application. They
 * are kept verbatim in `src/legacy` so the rendered markup, CSS classes and
 * behaviour remain identical. React owns the page lifecycle and calls the
 * renderer exactly once after the layout containers exist.
 */
export function useLegacyApp() {
  const outletRef = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    Promise.resolve(startLegacyApp(outletRef.current)).catch((error) => {
      console.error(error);
      const el = outletRef.current;
      if (!el) return;
      el.innerHTML =
        '<div class="card"><h3>CampusKart could not start</h3>' +
        '<p class="muted">' +
        String(error && error.message ? error.message : error) +
        '</p><p class="muted small">Check that the API is running on port 8080.</p></div>';
    });
  }, []);

  return outletRef;
}
