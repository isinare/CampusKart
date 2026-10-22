import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles/app.css";

// When the frontend is deployed separately (Render static site), point uploaded
// files at the API origin. In the combined deployment both values stay empty and
// all requests remain same-origin.
window.CK_UPLOAD_BASE = import.meta.env.VITE_UPLOAD_BASE || "";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
