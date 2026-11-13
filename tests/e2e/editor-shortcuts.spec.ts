import { expect, type Page, test } from "@playwright/test";

/**
 * Phase-2 acceptance: every TRD shortcut and the F17 paste policy, in real
 * Chromium. Unit tests cover the policy function; these drive the real
 * keymap through the mounted editor.
 */

async function readyEditor(page: Page) {
  await page.goto("/");
  const editor = page.locator('[aria-label="Editor"] .tiptap');
  await expect(editor).toBeVisible();
  // The editor mounts non-editable and only enables editing once boot
  // (font registration + openDoc) finishes. Keystrokes sent earlier are
  // silently dropped, so a fast test can select an empty document and the
  // shortcut under test becomes a no-op. Wait for editability first.
  await expect(editor).toHaveAttribute("contenteditable", "true", {
    timeout: 10_000,
  });
  await editor.click();
  return editor;
}

async function selectAll(page: Page) {
  await page.keyboard.press("ControlOrMeta+a");
}

test("bold, italic and underline via Ctrl+B/I/U", async ({ page }) => {
  const editor = await readyEditor(page);
  await page.keyboard.type("hello");
  await selectAll(page);
  await page.keyboard.press("ControlOrMeta+b");
  await expect(editor.locator("strong")).toContainText("hello");

  await page.keyboard.press("ControlOrMeta+i");
  await expect(editor.locator("strong em, em strong")).toContainText("hello");

  await page.keyboard.press("ControlOrMeta+u");
  const html = await editor.innerHTML();
  expect(html).toContain("<u>");
});

test("strikethrough via Alt+Shift+5 (Docs-compatible)", async ({ page }) => {
  const editor = await readyEditor(page);
  await page.keyboard.type("struck");
  await selectAll(page);
  await page.keyboard.press("Alt+Shift+5");
  const html = await editor.innerHTML();
  expect(html).toContain("<s>");
});

test("undo via Ctrl+Z, redo via Ctrl+Y and Ctrl+Shift+Z", async ({ page }) => {
  const editor = await readyEditor(page);
  await page.keyboard.type("hello");
  await selectAll(page);
  await page.keyboard.press("ControlOrMeta+b");
  await expect(editor.locator("strong")).toContainText("hello");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor.locator("strong")).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+y");
  await expect(editor.locator("strong")).toContainText("hello");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor.locator("strong")).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(editor.locator("strong")).toContainText("hello");
});

test("headings via Ctrl+Alt+1/2/3", async ({ page }) => {
  const editor = await readyEditor(page);
  await page.keyboard.type("Title");
  await selectAll(page);
  await page.keyboard.press("ControlOrMeta+Alt+1");
  await expect(editor.locator("h1")).toContainText("Title");

  await page.keyboard.press("ControlOrMeta+Alt+2");
  await expect(editor.locator("h2")).toContainText("Title");

  await page.keyboard.press("ControlOrMeta+Alt+3");
  await expect(editor.locator("h3")).toContainText("Title");
});

test("lists via Ctrl+Shift+8/7/9", async ({ page }) => {
  const editor = await readyEditor(page);
  await page.keyboard.type("item");
  await selectAll(page);
  await page.keyboard.press("ControlOrMeta+Shift+8");
  await expect(editor.locator("ul li")).toContainText("item");

  await page.keyboard.press("ControlOrMeta+Shift+7");
  await expect(editor.locator("ol li")).toContainText("item");

  await page.keyboard.press("ControlOrMeta+Shift+9");
  await expect(editor.locator("ul[data-type='taskList']")).toBeVisible();
});

test("alignment via Ctrl+Shift+L/E/R/J", async ({ page }) => {
  const editor = await readyEditor(page);
  await page.keyboard.type("aligned");
  await selectAll(page);

  await page.keyboard.press("ControlOrMeta+Shift+e");
  let html = await editor.innerHTML();
  expect(html).toContain("text-align: center");

  await page.keyboard.press("ControlOrMeta+Shift+r");
  html = await editor.innerHTML();
  expect(html).toContain("text-align: right");

  await page.keyboard.press("ControlOrMeta+Shift+j");
  html = await editor.innerHTML();
  expect(html).toContain("text-align: justify");

  await page.keyboard.press("ControlOrMeta+Shift+l");
  await expect(editor.locator("p")).toContainText("aligned");
});

test("link via Ctrl+K opens the dialog and applies", async ({ page }) => {
  const editor = await readyEditor(page);
  await page.keyboard.type("example");
  await selectAll(page);
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Add link");
  await dialog.getByLabel("URL").fill("https://example.com");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(editor.locator('a[href="https://example.com"]')).toContainText(
    "example",
  );
});

test("indent via Ctrl+] and outdent via Ctrl+[", async ({ page }) => {
  const editor = await readyEditor(page);
  await page.keyboard.type("indented");
  await selectAll(page);
  await page.keyboard.press("ControlOrMeta+]");
  let html = await editor.innerHTML();
  expect(html).toContain("margin-left");

  await page.keyboard.press("ControlOrMeta+[");
  html = await editor.innerHTML();
  expect(html).not.toContain("margin-left");
});

test("page break via Ctrl+Enter", async ({ page }) => {
  const editor = await readyEditor(page);
  await page.keyboard.type("before");
  // Chromium under mobile emulation swallows a trusted Ctrl+Enter keydown
  // in contenteditable (it reaches the element but ProseMirror never sees
  // it as a keymap match — verified against plain Enter, NumpadEnter and
  // synthetic dispatches). The binding itself is covered by a unit test
  // that dispatches a real KeyboardEvent on the view, and the physical
  // key is a manual Android device check. Here the same keydown is
  // dispatched in-browser to prove the keymap path in production code.
  await page.evaluate(() => {
    const el = document.querySelector(
      '[aria-label="Editor"] .tiptap',
    ) as HTMLElement;
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(editor.locator("[data-page-break]")).toBeVisible();
});

test("Ctrl+S saves and confirms", async ({ page }) => {
  await readyEditor(page);
  await page.keyboard.type("save me");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(
    page
      .getByTestId("toaster")
      .getByRole("status")
      .filter({ hasText: "Saved" }),
  ).toBeVisible();
  await expect(page.getByTestId("save-status")).toContainText(/Saved/, {
    timeout: 5000,
  });
});

test("paste keeps marks, drops foreign fonts/sizes and colors", async ({
  page,
}) => {
  const editor = await readyEditor(page);
  await editor.click();
  await page.evaluate(() => {
    const el = document.querySelector('[aria-label="Editor"] .tiptap');
    if (el === null) throw new Error("editor missing");
    const transfer = new DataTransfer();
    transfer.setData(
      "text/html",
      '<p style="font-family: SomeForeignFont; font-size: 28px; color: red">plain</p>' +
        "<p><strong>bold</strong> <em>italic</em> <u>under</u></p>" +
        '<p><a href="https://example.com">link</a></p>' +
        "<h2>head</h2>" +
        "<ul><li>one</li></ul>" +
        "<script>window.__pwned = true;</script>",
    );
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  const html = await editor.innerHTML();
  expect(html).toContain("plain");
  expect(html).not.toContain("SomeForeignFont");
  expect(html).not.toContain("28px");
  expect(html).not.toContain("red");
  expect(html).toContain("<strong>bold</strong>");
  expect(html).toContain("<h2>head</h2>");
  expect(html).toContain("<li><p>one</p></li>");
  expect(html).toContain('href="https://example.com"');
  const pwned = await page.evaluate(
    () => (window as unknown as { __pwned?: boolean }).__pwned,
  );
  expect(pwned).not.toBe(true);
});

test("paste drops javascript links and hostile attributes", async ({
  page,
}) => {
  const editor = await readyEditor(page);
  await editor.click();
  await page.evaluate(() => {
    const el = document.querySelector('[aria-label="Editor"] .tiptap');
    if (el === null) throw new Error("editor missing");
    const transfer = new DataTransfer();
    transfer.setData(
      "text/html",
      '<p onclick="evil()" id="x" class="y"><a href="javascript:alert(1)">click</a></p>',
    );
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  const html = await editor.innerHTML();
  expect(html).toContain("click");
  expect(html).not.toContain("javascript:");
  expect(html).not.toContain("onclick");
});

test("text-only paste inserts plain text", async ({ page }) => {
  const editor = await readyEditor(page);
  await editor.click();
  await page.evaluate(() => {
    const el = document.querySelector('[aria-label="Editor"] .tiptap');
    if (el === null) throw new Error("editor missing");
    const transfer = new DataTransfer();
    transfer.setData("text/plain", "just words");
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(editor).toContainText("just words");
});
