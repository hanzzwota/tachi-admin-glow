import { describe, expect, it } from "vitest";
import { shouldShowAppNavigation } from "@/lib/app-navigation";

describe("App navigation visibility", () => {
  it.each(["/", "/dashboard", "/riwayat", "/setor", "/saldo", "/profil"])(
    "shows on %s",
    (pathname) => {
      expect(shouldShowAppNavigation(pathname)).toBe(true);
    },
  );

  it.each(["/login", "/register", "/admin"])("stays hidden on %s", (pathname) => {
    expect(shouldShowAppNavigation(pathname)).toBe(false);
  });
});
