import { expect, type Page, test } from "@playwright/test";

/**
 * Phase-4/5 acceptance: the font system and the extras, in real Chromium.
 * The TestFont.ttf fixture stands in for the user's Kruti Dev file (same
 * code path: upload validation → IndexedDB → `FontFace` from ArrayBuffer).
 */

const FIXTURE_FONT = "tests/fixtures/TestFont.ttf";
const FIXTURE_IMAGE = "tests/fixtures/test-image.png";

/** Offline reloads need the service worker activated and controlling. */
async function waitForSWReady(page: Page) {
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
}

test("font upload, dropdown, toggle, palette, and offline reload", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const editor = page.locator('[aria-label="Editor"] .tiptap');
  await expect(editor).toBeVisible();
  await editor.click();

  // Upload the fixture font through the font manager.
  await page.getByLabel("Font family").selectOption("@manage");
  await expect(page.locator("dialog[open]")).toContainText("Fonts");
  await page
    .locator('input[aria-label="Choose font file"]')
    .setInputFiles(FIXTURE_FONT);
  await expect(page.locator("dialog[open]")).toContainText("TestFont");

  // Reject an invalid file with a message, without closing the dialog.
  await page
    .locator('input[aria-label="Choose font file"]')
    .setInputFiles(FIXTURE_IMAGE);
  await expect(page.locator("dialog[open] [role='alert']")).toContainText(
    /not a font|header/i,
  );
  await page.keyboard.press("Escape");

  // Apply the font to typed text via the toolbar dropdown.
  await page.keyboard.type("hindi");
  await page.keyboard.press("ControlOrMeta+a");
  await page.getByLabel("Font family").selectOption("TestFont");
  await expect(editor.locator("span[style*='TestFont']")).toContainText(
    "hindi",
  );
  await expect(
    page.evaluate(() => document.fonts.check('16px "TestFont"')),
  ).resolves.toBe(true);

  // The A/अ toggle switches back to the system font and back again.
  await page.getByRole("button", { name: /Toggle Hindi\/English/ }).click();
  await expect(editor.locator("span[style*='TestFont']")).toHaveCount(0);
  await page.getByRole("button", { name: /Toggle Hindi\/English/ }).click();
  await expect(editor.locator("span[style*='TestFont']")).toContainText(
    "hindi",
  );

  // The palette inserts the tapped glyph at the cursor in the active font.
  // ¼ sits in the first row, so no scrolling is needed to tap it. Refocus
  // and collapse the toggle's selection first: like typing, insertion
  // replaces a selected range.
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.press("ControlOrMeta+Shift+p");
  await expect(page.locator("dialog[open]")).toContainText(
    "Special characters",
  );
  await page.getByRole("button", { name: "Insert ¼", exact: true }).click();
  await expect(editor).toContainText("¼");
  await page.keyboard.press("Escape");

  // Wait for autosave, go offline, reload: the font still renders.
  await expect(page.getByTestId("save-status")).toContainText(/Saved/, {
    timeout: 5000,
  });
  await waitForSWReady(page);
  await context.setOffline(true);
  await page.reload();
  const offlineEditor = page.locator('[aria-label="Editor"] .tiptap');
  await expect(offlineEditor).toContainText("hindi");
  await expect(
    page.evaluate(() => document.fonts.check('16px "TestFont"')),
  ).resolves.toBe(true);
  const family = await offlineEditor
    .locator("span[style*='TestFont']")
    .evaluate((node) => getComputedStyle(node).fontFamily);
  expect(family).toContain("TestFont");
});

test("offline table insert, image insert, find and replace", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const editor = page.locator('[aria-label="Editor"] .tiptap');
  await expect(editor).toBeVisible();
  await editor.click();

  await expect(page.getByTestId("save-status")).toContainText(/Saved/, {
    timeout: 5000,
  });
  await waitForSWReady(page);
  await context.setOffline(true);
  await page.reload();
  const offlineEditor = page.locator('[aria-label="Editor"] .tiptap');
  await expect(offlineEditor).toBeVisible();
  await offlineEditor.click();

  // Table tools work offline (lazy chunk is precached).
  await page.getByRole("button", { name: /Insert table/ }).click();
  await expect(offlineEditor.locator("table")).toBeVisible();
  await expect(offlineEditor.locator("td, th")).not.toHaveCount(0);
  await page.getByRole("button", { name: /Add row below/ }).click();
  const rows = await offlineEditor.locator("table tr").count();
  expect(rows).toBeGreaterThanOrEqual(4);

  // Image insert works offline: pick a file, it renders from the store.
  await page.keyboard.press("ControlOrMeta+End");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Insert image/ }).click();
  await (await chooser).setFiles(FIXTURE_IMAGE);
  await expect(offlineEditor.locator("img.doc-image")).toBeVisible();

  // Find highlights matches; replace-all rewrites them. Refocus first:
  // toolbar buttons steal focus, and the keymap needs the editor focused.
  await offlineEditor.click();
  await page.keyboard.type("alpha beta alpha");
  await offlineEditor.click();
  await page.keyboard.press("ControlOrMeta+f");
  const findBar = page.getByRole("search", { name: "Find and replace" });
  await expect(findBar).toBeVisible();
  await findBar.getByLabel(/Find in document/).fill("alpha");
  await expect(page.getByTestId("find-count")).toContainText("2 found");
  await page.keyboard.press("ControlOrMeta+h");
  await expect(findBar.getByLabel("Replace with")).toBeVisible();
  await findBar.getByLabel("Replace with").fill("gamma");
  await findBar.getByRole("button", { name: "Replace all" }).click();
  await expect(offlineEditor).toContainText("gamma beta gamma");
  await page.keyboard.press("Escape");
  await expect(findBar).toBeHidden();
});
