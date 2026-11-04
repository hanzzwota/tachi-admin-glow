import { describe, expect, it } from "vitest";
import {
  INVALID_DATABASE_KEY_MESSAGE,
  MISSING_MIGRATION_MESSAGE,
  errorResponse,
} from "@/server/supabase";

describe("database error responses", () => {
  it("reports an invalid hosting key as 503 with a clear message", async () => {
    const response = errorResponse(
      new Error('Supabase 401: {"message":"Unregistered API key","hint":"..."}'),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe(INVALID_DATABASE_KEY_MESSAGE);
  });

  it("reports a missing column as a pending migration", async () => {
    const response = errorResponse(
      new Error(
        `Supabase 400: {"code":"PGRST204","message":"Could not find the 'store_closed_reason' column of 'app_settings' in the schema cache"}`,
      ),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe(MISSING_MIGRATION_MESSAGE);
  });

  it("still hides other raw database errors", async () => {
    const response = errorResponse(new Error('Supabase 500: {"message":"boom"}'));
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("Terjadi kesalahan pada database server");
  });
});
