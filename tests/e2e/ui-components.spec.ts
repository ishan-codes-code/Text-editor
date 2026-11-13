import { expect, test } from "@playwright/test";

/**
 * Phase-2 UI surfaces under preact/compat in real Chromium: the lazy link
 * dialog (focus trap, Escape, apply), the docs and settings sheets, the
 * theme toggle and the zoom control. Radix interaction stays in Playwright
 * because Vitest's SSR externalizer bypasses the preact/compat alias.
 */
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[aria-label="Editor"] .tiptap')).toBeVisible();
});

test("link dialog traps focus, closes with Escape and returns focus", async ({
  page,
}) => {
  const trigger = page.getByRole("button", { name: "Link (Ctrl+K)" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Add link");

  const focusInside = await page.evaluate(() => {
    const element = document.querySelector('[role="dialog"]');
    return element?.contains(document.activeElement) ?? false;
  });
  expect(focusInside).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("settings sheet shows storage status and backup actions", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Open settings" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Persistent storage");
  await expect(
    dialog.getByRole("button", { name: "Back up now" }),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Restore…" })).toBeVisible();

  // Top-layer dialog sits above the sticky header, so the viewport corner
  // hits the backdrop.
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();
});

test("docs sheet creates and searches", async ({ page }) => {
  await page.getByRole("button", { name: "Documents" }).click();
  let sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("Documents");

  // Creating opens the new doc and closes the sheet; reopen to manage.
  await sheet.getByRole("button", { name: "New document" }).click();
  await expect(sheet).toBeHidden();
  await page.getByRole("button", { name: "Documents" }).click();
  sheet = page.getByRole("dialog");
  await expect(
    sheet.getByRole("button", { name: /Open Untitled/ }),
  ).not.toHaveCount(0);

  await sheet.getByPlaceholder("Search documents…").fill("zzzz-no-match");
  await expect(sheet).toContainText("No documents match.");
  await sheet.getByPlaceholder("Search documents…").fill("");
  await expect(sheet).not.toContainText("No documents match.");
});

test("theme toggle switches dark mode and persists", async ({ page }) => {
  const toggle = page.getByRole("button", { name: /switch to/i });
  await toggle.click();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("dark")),
    )
    .toBe(true);

  await page.reload();
  // Poll: restoration must survive reload even if the app is still mounting.
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("dark")),
    )
    .toBe(true);

  await page.getByRole("button", { name: /switch to light/i }).click();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.classList.contains("dark")),
    )
    .toBe(false);
});

test("zoom selection persists across reload", async ({ page }) => {
  await page.getByLabel("Zoom").selectOption("1.5");
  // The setting writes to IndexedDB asynchronously; wait for it to land
  // before reloading or the reload can win the race and restore "1".
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<string | null>((resolve, reject) => {
              const open = indexedDB.open("offline-text-editor");
              open.onsuccess = () => {
                const db = open.result;
                try {
                  const request = db
                    .transaction("settings", "readonly")
                    .objectStore("settings")
                    .get("zoom");
                  request.onsuccess = () => {
                    db.close();
                    resolve(
                      (request.result as { value?: string } | undefined)
                        ?.value ?? null,
                    );
                  };
                  request.onerror = () => {
                    db.close();
                    reject(request.error);
                  };
                } catch (error) {
                  db.close();
                  reject(error);
                }
              };
              open.onerror = () => reject(open.error);
            }),
        ),
      { timeout: 5000 },
    )
    .toBe("1.5");
  await page.reload();
  await expect(page.locator('[aria-label="Editor"] .tiptap')).toBeVisible();
  await expect(page.getByLabel("Zoom")).toHaveValue("1.5");
});
