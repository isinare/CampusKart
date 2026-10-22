# CampusKart frontend

React 19 + Vite 8 single-page application. It preserves the original CampusKart
screens, CSS, labels and product artwork while talking to the Express/MongoDB API
instead of a browser mock.

## Run

```powershell
npm install
npm run dev      # http://localhost:5173, proxies /campuskart and /uploads to :8080
npm run build    # production bundle in dist/
npm test         # Vitest: 10 validation/formatting checks
```

The production build is served by Express at <http://localhost:8080> when
`frontend/dist` exists.

## Architecture

| Path | Purpose |
| --- | --- |
| `src/App.jsx` | React Router root; every path renders the CampusKart page |
| `src/pages/CampusKartPage.jsx` | Layout containers + legacy renderer lifecycle |
| `src/hooks/useLegacyApp.js` | Starts the preserved renderer exactly once |
| `src/context/AuthContext.jsx` | React view of the 8-hour session |
| `src/services/api.js` | Action client and REST `rest()` helper |
| `src/validation/validators.js` | Browser validation matching server rules |
| `src/utils/format.js` | Rupee/date formatting helpers |
| `src/tests/` | Vitest unit tests |
| `src/legacy/` | Preserved `app.js` and `api.js` renderer/client |
| `public/style.css` | Original complete visual system |
| `public/images/` | Original product artwork and hero image |

The legacy renderer uses hash routes (`#/browse`, `#/item/I101`). React Router
owns the top-level URL; `CampusKartPage` translates a deep link such as `/browse`
to `#/browse` once, so bookmarks and the Render SPA fallback work.

## Separate deployment

For a static frontend on another origin, set:

```text
VITE_API_BASE=https://<api-host>/campuskart
VITE_UPLOAD_BASE=https://<api-host>
```

and set `CORS_ORIGINS=https://<web-host>` on the API. In the combined Render
service both variables stay empty and all requests are same-origin.

## Why the renderer is preserved

Rewriting 30+ screens would risk changing labels, validation messages, states
and accessibility behaviour. React now owns the page lifecycle, routing, auth
context, error boundary and services; the original renderer owns the exact
markup and interactions. New React pages can be added alongside it using
`services/rest()` and `useAuth()`.
