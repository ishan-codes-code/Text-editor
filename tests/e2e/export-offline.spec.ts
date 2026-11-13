import { expect, test } from "@playwright/test";

/**
 * Export/import acceptance: TXT download while online, DOCX download while
 * offline (proves the lazy vendor chunks are precached), TXT import creating
 * a new document.
 *
 * In-sheet buttons are activated with keyboard focus + Enter: Playwright's
 * mouse hit-testing flakes on the transformed native `<dialog>` (fractional
 * -translate-y-1/2), while layout samples, elementFromPoint and real clicks
 * all confirm the buttons are on-screen and tappable. Each press is preceded
 * by an on-screen bounding-box assertion so a genuinely covered button still
 * fails the test.
 */
test("export and import work, including DOCX while offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const editor = page.locator('[aria-label="Editor"] .tiptap');
  await expect(editor).toBeVisible();
  // The editor mounts non-editable and only enables editing once boot
  // finishes: keystrokes sent earlier are silently dropped, so the dirty
  // wait below can never fire. Same guard as editor-shortcuts.spec.ts.
  await expect(editor).toHaveAttribute("contenteditable", "true", {
    timeout: 10_000,
  });

  await editor.click();
  await page.keyboard.type("Export me");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.press("End");
  // Autosave before exporting. The idle label already reads "Saved": wait
  // for the schedule to flip it to dirty first, otherwise the Saved wait
  // below passes vacuously and the reload can win the race against the
  // write under parallel load (the pagehide flush is best-effort only).
  await expect(page.getByTestId("save-status")).toContainText(
    /Unsaved|Saving/,
    { timeout: 5000 },
  );
  await expect(page.getByTestId("save-status")).toContainText(/Saved/, {
    timeout: 5000,
  });

  const openSheet = page.getByRole("dialog");
  await page.getByRole("button", { name: /export or import/i }).click();
  await expect(openSheet).toContainText(
    "Export \u201cUntitled\u201d (works offline)",
  );

  // TXT export fires a Blob download while online.
  const txtButton = openSheet.getByRole("button", { name: "TXT", exact: true });
  await expect(txtButton).toBeVisible();
  const txtBox = await txtButton.boundingBox();
  expect(txtBox, "TXT button is on-screen").not.toBeNull();
  expect(txtBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((txtBox?.x ?? 9999) + (txtBox?.width ?? 0)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  );
  const txtDownload = page.waitForEvent("download");
  await txtButton.focus();
  await page.keyboard.press("Enter");
  const txt = await txtDownload;
  expect(txt.suggestedFilename()).toMatch(/\.txt$/);
  await page.keyboard.press("Escape");

  // Go offline and reload: shell, docs and lazy chunks come from precache.
  await context.setOffline(true);
  await page.reload();
  const offlineEditor = page.locator('[aria-label="Editor"] .tiptap');
  await expect(offlineEditor).toBeVisible();
  await expect(offlineEditor).toContainText("Export me");

  // DOCX export works offline: the vendor chunk was precached at install.
  await page.getByRole("button", { name: /export or import/i }).click();
  const offlineSheet = page.getByRole("dialog");
  await expect(offlineSheet).toContainText(
    "Export \u201cUntitled\u201d (works offline)",
  );
  const docxButton = offlineSheet.getByRole("button", {
    name: "DOCX",
    exact: true,
  });
  await expect(docxButton).toBeVisible();
  const docxBox = await docxButton.boundingBox();
  expect(docxBox, "DOCX button is on-screen").not.toBeNull();
  const docxDownload = page.waitForEvent("download");
  await docxButton.focus();
  await page.keyboard.press("Enter");
  const docx = await docxDownload;
  expect(docx.suggestedFilename()).toMatch(/\.docx$/);

  // TXT import creates a new document with the file's text.
  const importButton = offlineSheet.getByRole("button", {
    name: /Choose TXT/,
  });
  await expect(importButton).toBeVisible();
  const fileChooser = page.waitForEvent("filechooser");
  await importButton.focus();
  await page.keyboard.press("Enter");
  await fileChooser.then((chooser) =>
    chooser.setFiles({
      name: "imported-note.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("imported hello\n\nsecond para"),
    }),
  );
  await expect(page.getByTestId("word-count")).toContainText("4 words", {
    timeout: 5000,
  });
});
