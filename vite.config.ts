import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

// Phase 1 adds vite-plugin-pwa (prompt update mode) here and keeps every
// lazy chunk precached so the app works fully offline.
export default defineConfig({
  // Relative base works on GitHub Pages project sites, Cloudflare Pages,
  // and custom domains alike. Revisit in phase 1 alongside the SW scope.
  base: "./",
  plugins: [preact(), tailwindcss()],
  // Pin IPv4 loopback so the dev server matches the Playwright baseURL
  // (http://127.0.0.1:5173) on machines where "localhost" resolves to ::1.
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  resolve: {
    // shadcn/ui is written for React; it runs on Preact through compat.
    alias: {
      react: "preact/compat",
      "react-dom": "preact/compat",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    include: ["src/**/*.test.{ts,tsx}", "tests/*.test.{ts,tsx}"],
  },
});
