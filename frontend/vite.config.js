import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API keeps the Java server's port and path, so the dev server simply
// proxies it. In production Express serves the built files and the API itself.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/campuskart": { target: "http://localhost:8080", changeOrigin: true },
      "/uploads": { target: "http://localhost:8080", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.js"],
  },
});
