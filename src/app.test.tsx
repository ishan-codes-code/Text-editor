import { render } from "preact";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./app";

describe("App", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the empty shell", () => {
    render(<App />, document.body);
    expect(document.body.textContent).toContain("Offline text editor");
  });
});
