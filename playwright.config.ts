import { defineConfig, devices } from "@playwright/test";

// Offline tests need the real service worker, which only exists in a
// production build served by `vite preview` — never the dev server, and
// never a stale dist, so the webServer always rebuilds first.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
  },
  projects: [
    {
      name: "android-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
    timeout: 180 * 1000,
  },
});
