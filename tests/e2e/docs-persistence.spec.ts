import { expect, test } from "@playwright/test";

/**
 * Phase-3 acceptance: documents persist in IndexedDB across reloads, the
 * doc list manages the library, and a tab killed mid-typing loses at most
 * the debounce window (~500 ms) thanks to forced saves on pagehide.
 */

test("typing persists across reload", async ({ page }) => {
  await page.goto("/");
  const editor = page.locator('[aria-label="Editor"] .tiptap');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type("durable words here");
  await expect(page.getByTestId("save-status")).toContainText(/Saved/, {
    timeout: 5000,
  });

  await page.reload();
  const reloaded = page.locator('[aria-label="Editor"] .tiptap');
  await expect(reloaded).toBeVisible();
  await expect(reloaded).toContainText("durable words here");
  await expect(page.getByTestId("word-count")).toContainText("3 words");
});

test("killed mid-typing loses at most the debounce window", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.locator('[aria-label="Editor"] .tiptap');
  await expect(editor).toBeVisible();
  await editor.click();

  // First chunk gets a full autosave cycle; the second is typed right
  // before the simulated kill. Acceptance: at most the ~500 ms debounce
  // window is lost, so the first chunk must survive the reload (a pagehide
  // flush saves the second chunk on a best-effort basis, but unload timing
  // makes that racy by nature, so it is not asserted).
  await page.keyboard.type("first chunk");
  await expect(page.getByTestId("save-status")).toContainText(/Saved/, {
    timeout: 5000,
  });
  await page.keyboard.type(" second chunk");
  await page.reload();
  const reloaded = page.locator('[aria-label="Editor"] .tiptap');
  await expect(reloaded).toBeVisible();
  await expect(reloaded).toContainText("first chunk");
});

test("doc list creates, renames, duplicates, searches and deletes", async ({
  page,
}) => {
  await page.goto("/");
  const editor = page.locator('[aria-label="Editor"] .tiptap');
  await expect(editor).toBeVisible();

  await page.getByRole("button", { name: "Documents" }).click();
  let sheet = page.locator("dialog[open]");
  await expect(sheet).toContainText("Documents");

  // Create opens the new doc and closes the sheet; reopen to manage it.
  await sheet.getByRole("button", { name: "New document" }).click();
  await expect(sheet).toBeHidden();
  await page.getByRole("button", { name: "Documents" }).click();
  sheet = page.locator("dialog[open]");
  await expect(
    sheet.getByRole("button", { name: /Open Untitled/ }),
  ).toHaveCount(2);

  // Rename the first Untitled doc.
  await sheet.getByRole("button", { name: "Rename Untitled" }).first().click();
  await sheet.getByLabel("Document title").fill("Shopping list");
  await sheet.getByLabel("Document title").press("Enter");
  await expect(
    sheet.getByRole("button", { name: "Open Shopping list" }),
  ).toBeVisible();

  // Duplicate.
  await sheet.getByRole("button", { name: "Duplicate Shopping list" }).click();
  await expect(
    sheet.getByRole("button", { name: /Open Shopping list/ }),
  ).toHaveCount(2);

  // Search filters.
  await sheet.getByPlaceholder("Search documents…").fill("shopping");
  await expect(
    sheet.getByRole("button", { name: /Open Shopping list/ }),
  ).toHaveCount(2);
  await sheet.getByPlaceholder("Search documents…").fill("nothing matches");
  await expect(sheet).toContainText("No documents match.");

  // Delete everything matching, then close. Synchronize on the count
  // after each delete: the list refreshes asynchronously.
  await sheet.getByPlaceholder("Search documents…").fill("");
  page.on("dialog", (dialog) => void dialog.accept());
  // Wait for the cleared search to repopulate before counting.
  await expect(
    sheet.getByRole("button", { name: /Open Shopping list/ }),
  ).toHaveCount(2);
  let remaining = await sheet
    .getByRole("button", { name: /Delete Shopping list/ })
    .count();
  expect(remaining).toBeGreaterThan(0);
  while (remaining > 0) {
    await sheet
      .getByRole("button", { name: /Delete Shopping list/ })
      .first()
      .click();
    remaining -= 1;
    await expect(
      sheet.getByRole("button", { name: /Delete Shopping list/ }),
    ).toHaveCount(remaining);
  }
  await expect(
    sheet.getByRole("button", { name: /Open Shopping list/ }),
  ).toHaveCount(0);
});
