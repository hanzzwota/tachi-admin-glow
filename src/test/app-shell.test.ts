import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const appShell = readFileSync(resolve(process.cwd(), "public/app-shell.js"), "utf8");

function loadNavigation(currentUrl = "https://app.test/login") {
  const assigned: string[] = [];
  const targetWindow = {
    location: new URL(currentUrl),
    history: {
      pushState(_state: unknown, _title: string, path: string) {
        targetWindow.location = new URL(path, targetWindow.location.href);
      },
    },
    dispatchEvent() {
      return true;
    },
  };
  const window: { top: typeof targetWindow; navigateTo?: (view: string) => boolean } = {
    top: targetWindow,
  };
  const document = { getElementById: () => null };
  const PopStateEvent = class PopStateEvent {};
  runInNewContext(appShell, { window, document, URL, PopStateEvent, console });
  return { navigateTo: window.navigateTo!, assigned, targetWindow };
}

describe("standalone page navigation", () => {
  it("updates the top-level URL without a document reload", () => {
    const { navigateTo, assigned, targetWindow } = loadNavigation("https://app.test/login");

    expect(navigateTo("dashboard")).toBe(true);
    expect(targetWindow.location.pathname).toBe("/dashboard");
    expect(assigned).toEqual([]);
  });

  it("navigates to the protected admin route without a document reload", () => {
    const { navigateTo, targetWindow } = loadNavigation("https://app.test/dashboard");

    expect(navigateTo("admin")).toBe(true);
    expect(targetWindow.location.pathname).toBe("/admin");
  });

  it("ignores unknown views", () => {
    const { navigateTo, assigned } = loadNavigation();

    expect(navigateTo("unknown")).toBe(false);
    expect(assigned).toEqual([]);
  });
});
