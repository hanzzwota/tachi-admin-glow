import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const appShell = readFileSync(resolve(process.cwd(), "public/app-shell.js"), "utf8");

function loadNavigation(currentUrl = "https://app.test/login") {
  const assigned: string[] = [];
  const targetWindow = {
    location: {
      href: currentUrl,
      assign(path: string) {
        assigned.push(path);
      },
    },
  };
  const window: { top: typeof targetWindow; navigateTo?: (view: string) => boolean } = {
    top: targetWindow,
  };
  const document = { getElementById: () => null };
  runInNewContext(appShell, { window, document, URL });
  return { navigateTo: window.navigateTo!, assigned };
}

describe("standalone page navigation", () => {
  it("redirects the top-level app to dashboard after login", () => {
    const { navigateTo, assigned } = loadNavigation("https://app.test/login");

    expect(navigateTo("dashboard")).toBe(true);
    expect(assigned).toEqual(["/dashboard"]);
  });

  it("maps the legacy stor view to the standalone setor route", () => {
    const { navigateTo, assigned } = loadNavigation("https://app.test/dashboard");

    expect(navigateTo("stor")).toBe(true);
    expect(assigned).toEqual(["/setor"]);
  });

  it("ignores unknown views", () => {
    const { navigateTo, assigned } = loadNavigation();

    expect(navigateTo("unknown")).toBe(false);
    expect(assigned).toEqual([]);
  });
});
