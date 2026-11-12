import { expect, test } from "@playwright/test";

test("loads the empty shell", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /offline text editor/i }),
  ).toBeVisible();
});
