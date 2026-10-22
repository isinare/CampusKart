import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import CampusKartPage from "./pages/CampusKartPage.jsx";

/**
 * React application root.
 *
 * React Router owns the top-level route. Every path renders the preserved
 * CampusKart single-page application; unknown paths are handled by the same
 * renderer, which shows its own "page does not exist" screen. This keeps old
 * bookmarks and Render's SPA fallback working.
 */
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<CampusKartPage />} />
        <Route path="/index.html" element={<Navigate to="/" replace />} />
        <Route path="*" element={<CampusKartPage />} />
      </Routes>
    </AuthProvider>
  );
}
