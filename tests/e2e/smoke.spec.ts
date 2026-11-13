import { expect, test } from "@playwright/test";

test("loads the editor shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[aria-label="Editor"] .tiptap')).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Formatting" })).toBeVisible();
  await expect(page.getByTestId("word-count")).toBeVisible();
  await expect(page.getByTestId("save-status")).toBeVisible();
});
