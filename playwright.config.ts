import { defineConfig, devices } from "@playwright/test";

// Offline tests need the real service worker, which only exists in a
// production build served by `vite preview` — never the dev server, and
// never a stale dist. Local runs rebuild first; CI builds once beforehand
// and sets E2E_REUSE_BUILD=1 so the same dist is reused for size checks,
// E2E, and the Pages artifact.
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
    command: process.env.E2E_REUSE_BUILD
      ? "npm run preview"
      : "npm run build && npm run preview",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
    timeout: 180 * 1000,
  },
});
