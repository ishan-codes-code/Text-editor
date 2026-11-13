import { expect, type Page, test } from "@playwright/test";

/**
 * Phase-B acceptance: bullet/numbered/checklists toggle through the real
 * toolbar, behave with the keyboard, show their active state, and survive a
 * reload (save queue + JSON round-trip).
 */

async function readyEditor(page: Page) {
  await page.goto("/");
  const editor = page.locator('[aria-label="Editor"] .tiptap');
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute("contenteditable", "true", {
    timeout: 10_000,
  });
  await editor.click();
  return editor;
}

test("bullet list toggles, indents with Enter and exits with a second Enter", async ({
  page,
}) => {
  const editor = await readyEditor(page);
  await page.keyboard.type("first");

  await page
    .getByRole("button", { name: "Bullet list (Ctrl+Shift+8)" })
    .click();
  await expect(editor.locator("ul > li")).toHaveCount(1);
  // Active state reflects the selection.
  await expect(
    page.getByRole("button", { name: "Bullet list (Ctrl+Shift+8)" }),
  ).toHaveClass(/bg-secondary/);

  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second");
  await expect(editor.locator("ul > li")).toHaveCount(2);

  // Enter on an empty item exits the list; the finished items stay listed.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Bullet list (Ctrl+Shift+8)" }),
  ).not.toHaveClass(/bg-secondary/);
  const html = await editor.innerHTML();
  expect(html).toContain("<ul>");
  expect(html).toContain("first");
  expect(html).toContain("second");
});

test("numbered list toggles and checklist inserts task items", async ({
  page,
}) => {
  const editor = await readyEditor(page);
  await page.keyboard.type("one");

  await page
    .getByRole("button", { name: "Numbered list (Ctrl+Shift+7)" })
    .click();
  await expect(editor.locator("ol > li")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Numbered list (Ctrl+Shift+7)" }),
  ).toHaveClass(/bg-secondary/);

  await page.getByRole("button", { name: "Checklist (Ctrl+Shift+9)" }).click();
  // The live view renders the item li without data-type; the taskList ul
  // is the stable hook (verified against the real DOM).
  await expect(editor.locator('ul[data-type="taskList"] > li')).toHaveCount(1);
});

test("list content persists across reload", async ({ page }) => {
  await readyEditor(page);
  await page.keyboard.type("persist me");
  await page
    .getByRole("button", { name: "Bullet list (Ctrl+Shift+8)" })
    .click();
  await expect(page.getByTestId("save-status")).toContainText(/Saved/, {
    timeout: 5000,
  });

  await page.reload();
  const reloaded = page.locator('[aria-label="Editor"] .tiptap');
  await expect(reloaded).toBeVisible();
  await expect(reloaded.locator("ul > li")).toHaveCount(1);
  await expect(reloaded).toContainText("persist me");
});
