import { expect, test } from "@playwright/test";

/**
 * Service worker update flow (TRD): prompt mode. The worker never reloads the
 * page on its own; a new version applies only on explicit user tap. With a
 * single build there is no newer version, so this test pins the steady-state
 * half: no spontaneous reload, no banner, and a worker whose update wiring is
 * message-driven (SKIP_WAITING on tap) with every lazy chunk precached.
 */
test("no automatic reload; worker uses prompt-mode updates", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.locator('[aria-label="Editor"] .tiptap');
  await expect(editor).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __boot: number }).__boot = Date.now();
  });
  await editor.click();
  await page.keyboard.type("update flow probe");
  await expect(page.getByTestId("save-status")).toContainText(/Saved/, {
    timeout: 5000,
  });

  // Steady state: nothing reloads the page and no update banner appears.
  await page.waitForTimeout(5000);
  expect(await page.evaluate(() => (window as unknown as { __boot: number }).__boot)).toBeGreaterThan(0);
  await expect(editor).toContainText("update flow probe");
  await expect(page.getByText("Update available.")).toBeHidden();

  // The worker applies updates only when the app sends SKIP_WAITING (user
  // tap); it never calls skipWaiting unconditionally on install.
  const swText = await page.evaluate(async () => {
    const response = await fetch("sw.js");
    if (!response.ok) throw new Error(`sw.js fetch failed: ${response.status}`);
    return response.text();
  });
  expect(swText).toContain("SKIP_WAITING");
  // The only skipWaiting call is inside the message listener (prompt mode).
  const calls = swText.match(/self\.skipWaiting\(\)/g) ?? [];
  expect(calls).toHaveLength(1);
  expect(swText).toContain('"SKIP_WAITING"===s.data.type&&self.skipWaiting()');

  // Every lazy chunk the offline tests need is precached.
  for (const chunk of [
    "chunk-vendor-docx-",
    "chunk-vendor-mammoth-",
    "chunk-formats-",
    "chunk-docxExport-",
    "chunk-import-",
    "chunk-dist-",
  ]) {
    expect(swText, `precache contains ${chunk}`).toContain(chunk);
  }
});
