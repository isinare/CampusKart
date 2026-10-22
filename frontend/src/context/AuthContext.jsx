import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { session } from "../services/api.js";

const AuthContext = createContext(null);

function readSession() {
  try {
    return session();
  } catch {
    return null;
  }
}

/**
 * React-side view of the 8-hour CampusKart session. The legacy renderer owns
 * the login form and the HttpOnly cookie; this context mirrors the public
 * session data into React so new React components can make auth-aware choices.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(readSession);

  const refresh = useCallback(() => setUser(readSession()), []);

  useEffect(() => {
    const onChange = () => refresh();
    window.addEventListener("ck-auth", onChange);
    window.addEventListener("storage", onChange);
    window.addEventListener("hashchange", onChange);
    return () => {
      window.removeEventListener("ck-auth", onChange);
      window.removeEventListener("storage", onChange);
      window.removeEventListener("hashchange", onChange);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === "ADMIN",
      isStudent: user?.role === "STUDENT",
      refresh,
    }),
    [user, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
