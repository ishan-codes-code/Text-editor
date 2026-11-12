import { defineConfig, devices } from "@playwright/test";

// Phase 1 adds offline reload, install, export and table coverage on top of
// this Chromium + Android-viewport project.
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
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
});
