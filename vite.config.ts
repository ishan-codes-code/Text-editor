import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

// Phase 1 adds vite-plugin-pwa (prompt update mode) here and keeps every
// lazy chunk precached so the app works fully offline.
export default defineConfig({
  // Relative base works on GitHub Pages project sites, Cloudflare Pages,
  // and custom domains alike. Revisit in phase 1 alongside the SW scope.
  base: "./",
  plugins: [
    preact(),
    tailwindcss(),
    VitePWA({
      // Prompt mode per TRD: the app shows "Update available" and applies it
      // only on user tap (or when saved and idle). Never auto-reload.
      registerType: "prompt",
      injectRegister: "auto",
      manifest: {
        name: "Offline Text Editor",
        short_name: "Text Editor",
        description: "Offline-first rich-text editor with custom font support.",
        // Relative so any static host works (project site or custom domain).
        start_url: ".",
        scope: ".",
        display: "standalone",
        orientation: "any",
        background_color: "#0f172a",
        theme_color: "#0f172a",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache every build asset, including all lazy chunks (tables,
        // docx, mammoth, import, heavy dialogs in later phases). A lazy chunk
        // that is not cached breaks its feature offline, so after any change
        // to chunking or dynamic imports: rebuild, inspect the precache
        // manifest, and run the offline Playwright test.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        cleanupOutdatedCaches: true,
        // Prompt mode: do not skipWaiting / claim while the user may be
        // editing. The app calls updateSW(true) only on explicit tap.
        skipWaiting: false,
        clientsClaim: false,
      },
    }),
  ],
  // Pin validated names so `size-limit` can tell core JS apart from heavy
  // lazy chunks, and so the precache manifest is easy to audit. Async chunks
  // (dialogs, tables, export/import, vendor libs) use chunkFileNames, so the
  // size budget measures the startup entry only, per the TRD core-JS budget.
  build: {
    rollupOptions: {
      output: {
        entryFileNames: "assets/entry-[hash].js",
        chunkFileNames: "assets/chunk-[name]-[hash].js",
        manualChunks: (id) => {
          if (id.includes("node_modules/docx/")) return "vendor-docx";
          if (id.includes("node_modules/mammoth/")) return "vendor-mammoth";
          return undefined;
        },
      },
    },
  },
  server: {
    // Pin IPv4 loopback so the dev server matches the Playwright baseURL
    // (http://127.0.0.1:5173) on machines where "localhost" resolves to ::1.
    host: "127.0.0.1",
    port: 5173,
  },
  preview: {
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
