import { expect, test } from "@playwright/test";

/**
 * Phase A visual verification loop. Tablet-first matrix plus a phone smoke
 * case: the shell must fit every target size with no horizontal page scroll.
 * Baselines live in __snapshots__/ and are reviewed on every UI change —
 * regenerate with `npx playwright test viewport-matrix --update-snapshots`,
 * look at the images, fix overflow/clipping, then commit.
 */
const VIEWPORTS = [
  { name: "tablet-portrait", width: 800, height: 1280 },
  { name: "tablet-landscape", width: 1280, height: 800 },
  { name: "split-half", width: 600, height: 960 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`shell fits ${viewport.name} without horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.goto("/");
    await expect(page.locator('[aria-label="Editor"] .tiptap')).toBeVisible();
    // The shell owns the viewport: the page itself must never scroll sideways.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page).toHaveScreenshot(`shell-${viewport.name}.png`, {
      maxDiffPixels: 200,
    });
  });
}

test("tablet landscape docks the documents panel", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.locator('[aria-label="Editor"] .tiptap')).toBeVisible();
  await expect(
    page.locator('aside[aria-label="Documents panel"]'),
  ).toBeVisible();
  // The slide-over trigger hides when the panel is docked.
  await expect(page.getByRole("button", { name: "Documents" })).toBeHidden();
});

test("tablet portrait reaches documents through the sheet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 1280 });
  await page.goto("/");
  await expect(page.locator('[aria-label="Editor"] .tiptap')).toBeVisible();
  await expect(
    page.locator('aside[aria-label="Documents panel"]'),
  ).toBeHidden();
  await page.getByRole("button", { name: "Documents" }).click();
  await expect(page.getByRole("dialog")).toContainText("Documents");
  await expect(page).toHaveScreenshot("sheet-tablet-portrait.png", {
    maxDiffPixels: 200,
  });
});

test("phone reaches documents through a bottom sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator('[aria-label="Editor"] .tiptap')).toBeVisible();
  await page.getByRole("button", { name: "Documents" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Documents");
  const box = await dialog.boundingBox();
  if (box === null) throw new Error("dialog has no bounding box");
  // Bottom sheet: spans the width, sits in the lower half.
  expect(box.width).toBeGreaterThanOrEqual(380);
  expect(box.y).toBeGreaterThan(300);
});
