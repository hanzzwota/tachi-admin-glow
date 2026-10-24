import { describe, expect, it } from "vitest";
import { rateLimit } from "../server/rate-limit";

function requestFor(ip: string) {
  return new Request("https://app.test/api", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("rate-limit messages", () => {
  it("explains when a login attempt limit is reached", async () => {
    const request = requestFor("192.0.2.31");
    expect(rateLimit(request, "auth/login", 1, 15 * 60 * 1000)).toBeNull();

    const response = rateLimit(request, "auth/login", 1, 15 * 60 * 1000);
    expect(response?.status).toBe(429);
    expect(response?.headers.get("retry-after")).toBeTruthy();
    await expect(response?.json()).resolves.toMatchObject({
      error: expect.stringMatching(/percobaan login.*menit/i),
    });
  });

  it("uses registration wording for registration limits", async () => {
    const request = requestFor("192.0.2.32");
    expect(rateLimit(request, "auth/register", 1, 60 * 60 * 1000)).toBeNull();

    const response = rateLimit(request, "auth/register", 1, 60 * 60 * 1000);
    expect(response?.status).toBe(429);
    await expect(response?.json()).resolves.toMatchObject({
      error: expect.stringMatching(/percobaan pendaftaran.*menit/i),
    });
  });
});
