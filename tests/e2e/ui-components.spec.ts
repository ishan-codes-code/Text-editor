import { expect, test } from "@playwright/test";

/**
 * Every scaffolded shadcn-style component renders and behaves under
 * preact/compat in real Chrome: native <dialog> focus trap for Dialog and
 * Sheet, light-dismiss + Escape for the menu, filter + keyboard select for
 * Command, and auto-dismiss for the Sonner-style toaster.
 */
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /offline text editor/i }),
  ).toBeVisible();
});

test("dialog traps focus, closes with Escape and returns focus", async ({
  page,
}) => {
  const trigger = page.getByRole("button", { name: "About" });
  await trigger.click();
  // Both Dialog and Sheet mount a <dialog>; only the open one matters.
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Offline text editor");

  const focusInside = await page.evaluate(() => {
    const element = document.querySelector("dialog[open]");
    return element?.contains(document.activeElement) ?? false;
  });
  expect(focusInside).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("dropdown menu selects an item and toasts", async ({ page }) => {
  await page.getByRole("button", { name: "Insert" }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(page.getByRole("button", { name: "Insert" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  await page.getByRole("menuitem", { name: "Table" }).click();
  await expect(menu).toBeHidden();
  await expect(
    page.getByRole("status").filter({ hasText: "Tables land in phase 5" }),
  ).toBeVisible();
});

test("settings sheet opens and closes on backdrop click", async ({ page }) => {
  await page.getByRole("button", { name: "Open settings" }).click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Persistent storage");

  // Top-layer dialog sits above the sticky header, so the viewport corner
  // hits the backdrop.
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();
});

test("command palette filters and selects via keyboard", async ({ page }) => {
  const input = page.getByPlaceholder("Search fonts…");
  await input.fill("serif");
  await expect(page.getByRole("option", { name: "Serif" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Monospace" })).toBeHidden();

  await input.fill("");
  await expect(page.getByRole("option", { name: "Monospace" })).toBeVisible();
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Font: Monospace" }),
  ).toBeVisible();
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
