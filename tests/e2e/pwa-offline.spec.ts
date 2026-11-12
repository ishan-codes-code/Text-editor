import { expect, test } from "@playwright/test";

/**
 * Phase-1 acceptance: the app loads online, registers its service worker,
 * exposes an installable manifest, then keeps working after going offline
 * and reloading. The real home-screen install prompt is a manual check on
 * the Android device (see the phase summary).
 */
test("loads online, then works offline after reload", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /offline text editor/i }),
  ).toBeVisible();
  const editor = page.locator('[aria-label="Editor"] .tiptap');
  await expect(editor).toBeVisible();

  // Service worker is registered (prompt mode: installed without reloading).
  // Activation can still be in flight right after first load, so poll.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          if (!("serviceWorker" in navigator)) return "unsupported";
          const registration = await navigator.serviceWorker.ready;
          return (
            registration.active?.state ??
            registration.waiting?.state ??
            registration.installing?.state ??
            "none"
          );
        }),
      { timeout: 10_000 },
    )
    .toBe("activated");

  // Installability basics: manifest + every icon resolves while online.
  const manifestHref = await page.getAttribute(
    'link[rel="manifest"]',
    "href",
  );
  expect(manifestHref).toBeTruthy();
  const manifestUrl = new URL(manifestHref ?? "", page.url()).toString();
  const manifestResponse = await page.request.get(manifestUrl);
  expect(manifestResponse.ok()).toBe(true);
  const manifest = (await manifestResponse.json()) as {
    name: string;
    short_name: string;
    display: string;
    start_url: string;
    icons: { src: string; sizes: string; type: string; purpose?: string }[];
  };
  expect(manifest.name).toBe("Offline Text Editor");
  expect(manifest.display).toBe("standalone");
  const sizes = manifest.icons.map((icon) => icon.sizes);
  expect(sizes).toContain("192x192");
  expect(sizes).toContain("512x512");
  expect(
    manifest.icons.some((icon) => icon.purpose === "maskable"),
  ).toBe(true);
  for (const icon of manifest.icons) {
    const response = await page.request.get(
      new URL(icon.src, manifestUrl).toString(),
    );
    expect(response.ok()).toBe(true);
  }

  // Editing works while online.
  await editor.click();
  await page.keyboard.type("hello offline");
  await expect(page.getByTestId("word-count")).toContainText("2 words");

  // Go offline and reload: shell, editor and styles come from the precache.
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /offline text editor/i }),
  ).toBeVisible();
  const offlineEditor = page.locator('[aria-label="Editor"] .tiptap');
  await expect(offlineEditor).toBeVisible();
  await offlineEditor.click();
  await page.keyboard.type("still works");
  await expect(page.getByTestId("word-count")).toContainText("2 words");
});
