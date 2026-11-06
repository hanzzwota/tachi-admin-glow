const SESSION_COOKIE = "tachi_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type Row = Record<string, unknown>;

/** Thrown when the database cannot be reached at all (DNS, network, server down). */
export class DatabaseUnavailableError extends Error {
  constructor(cause: unknown) {
    super("Server tidak dapat terhubung ke database. Silakan coba lagi beberapa saat lagi.");
    this.name = "DatabaseUnavailableError";
    this.cause = cause;
  }
}

// Read config per request: env vars are only guaranteed inside handlers on the edge runtime.
// Secret managers may return values wrapped in quotes or with escaped newlines.
// Do not base64-decode or otherwise decrypt here: hosting must decrypt secrets before
// exposing them to the process. Supabase supports both legacy JWT keys (eyJ...) and
// new opaque keys (sb_secret_...).
function cleanEnvValue(value: string | undefined) {
  return (value ?? "")
    .trim()
    .replace(/^(['"])(.*)\1$/s, "$2")
    .replace(/\\n/g, "")
    .replace(/[\r\n\t ]/g, "");
}

function supabaseConfig() {
  const url = cleanEnvValue(process.env["SUPABASE_URL"]).replace(/\/+$/, "");
  const key =
    [
      process.env["SUPABASE_SECRET_KEY"],
      process.env["SUPABASE_SERVICE_ROLE_KEY"],
      process.env["SUPABASE_KEY"],
      process.env["SUPABASE_API_KEY"],
    ]
      .map(cleanEnvValue)
      .find(Boolean) ?? "";
  if (!url || !key) {
    throw new Error(
      "Koneksi database belum dikonfigurasi di server (SUPABASE_URL / SUPABASE_SECRET_KEY atau SUPABASE_SERVICE_ROLE_KEY)",
    );
  }
  return { url: url.replace(/\/$/, ""), key };
}

export async function supabaseFetch<T = Row>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = supabaseConfig();
  const startedAt = performance.now();
  const method = String(init.method || "GET").toUpperCase();
  const resource = path.split("?")[0];
  const logQueryTiming = (status: number) => {
    if (process.env["SUPABASE_PERF_LOG"] === "1") {
      console.info(
        `[supabase-perf] ${method} ${resource} status=${status} duration_ms=${Math.round(performance.now() - startedAt)}`,
      );
    }
  };
  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  // New-style keys (sb_secret_...) are opaque, not JWTs: sending them as a Bearer token is rejected.
  // Legacy service-role keys are JWTs beginning with eyJ and need the Bearer header.
  if (key.startsWith("eyJ")) headers["Authorization"] = `Bearer ${key}`;
  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers });
  } catch (error) {
    logQueryTiming(0);
    console.error("[supabaseFetch] network error:", error);
    throw new DatabaseUnavailableError(error);
  }
  if (!response.ok) {
    logQueryTiming(response.status);
    const message = await response.text();
    throw new Error(`Supabase ${response.status}: ${message}`);
  }
  logQueryTiming(response.status);
  if (response.status === 204) return undefined as T;
  const raw = await response.text();
  if (!raw.trim()) return undefined as T;
  return JSON.parse(raw) as T;
}

function bytesToBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}
function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export async function hashPassword(
  password: string,
  salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16))),
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: base64ToBytes(salt), iterations: 120_000, hash: "SHA-256" },
    key,
    256,
  );
  return { hash: bytesToBase64(new Uint8Array(bits)), salt };
}

export async function verifyPassword(password: string, hash: string, salt: string) {
  const candidate = await hashPassword(password, salt);
  return candidate.hash === hash;
}

async function hashSession(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToBase64(new Uint8Array(digest));
}

export async function sessionTokenHash(request: Request) {
  const token = cookieValue(request);
  return token ? hashSession(token) : null;
}

function cookieValue(request: Request) {
  return request.headers.get("cookie")?.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))?.[1];
}
function sessionCookie(token: string, maxAge = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=None; Secure`;
}

export async function createSession(profileId: string) {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = bytesToBase64(tokenBytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  const tokenHash = await hashSession(token);
  await supabaseFetch("sessions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      token_hash: tokenHash,
      profile_id: profileId,
      expires_at: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
    }),
  });
  return { token, cookie: sessionCookie(token) };
}

export async function getCurrentUser(request: Request) {
  const token = cookieValue(request);
  if (!token) return null;
  const tokenHash = await hashSession(token);
  const sessions = await supabaseFetch<{ profile_id: string }[]>(
    `sessions?select=profile_id&token_hash=eq.${encodeURIComponent(tokenHash)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`,
  );
  const profileId = sessions[0]?.profile_id;
  if (!profileId) return null;
  const profiles = await supabaseFetch<Row[]>(
    `profiles?select=id,username,display_name,avatar_url,role,balance,withdrawn,wallet_bank,wallet_name,wallet_number& id=eq.${encodeURIComponent(profileId)}`.replace(
      "& id=",
      "&id=",
    ),
  );
  return profiles[0] ?? null;
}

export async function requireUser(request: Request) {
  const user = await getCurrentUser(request);
  if (!user)
    throw new Response(JSON.stringify({ error: "Anda harus login terlebih dahulu" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  return user;
}

export async function requireAdmin(request: Request) {
  const user = await requireUser(request);
  if (user["role"] !== "admin")
    throw new Response(JSON.stringify({ error: "Akses admin ditolak" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  return user;
}

export function clearSessionCookie() {
  return sessionCookie("", 0);
}

export async function getSettings() {
  const rows = await supabaseFetch<Row[]>("app_settings?select=*&id=eq.1&limit=1");
  return rows[0] ?? null;
}

export const INVALID_DATABASE_KEY_MESSAGE =
  "Server tidak bisa masuk ke database: kunci SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY di hosting tidak valid atau bukan milik project SUPABASE_URL. Admin perlu memperbarui environment variable lalu redeploy.";
export const MISSING_MIGRATION_MESSAGE =
  "Struktur database belum lengkap (migration belum diterapkan di project Supabase yang dipakai server).";

export function isInvalidDatabaseKeyMessage(message: string) {
  return (
    /^Supabase 401\b/.test(message) &&
    /(Unregistered API key|Invalid API key|No API key|JWT|invalid.*key)/i.test(message)
  );
}

export function isMissingColumnMessage(message: string) {
  return (
    message.startsWith("Supabase ") &&
    /(PGRST204|"42703"|Could not find the '[^']+' column|column [^ ]+ does not exist)/.test(message)
  );
}

/** Secret-free status for /api/health: shows which project the server uses and whether it can read it. */
export async function databaseHealth(columns: string[]) {
  let project = "";
  try {
    const { url } = supabaseConfig();
    project = new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return { database: "not_configured", project, missing_columns: [] as string[] };
  }
  try {
    await supabaseFetch("app_settings?select=id&limit=1");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const database =
      error instanceof DatabaseUnavailableError
        ? "unreachable"
        : isInvalidDatabaseKeyMessage(message)
          ? "invalid_key"
          : isMissingColumnMessage(message) || /PGRST205|42P01/.test(message)
            ? "missing_tables"
            : "error";
    return { database, project, missing_columns: [] as string[] };
  }
  const missing: string[] = [];
  for (const column of columns) {
    try {
      await supabaseFetch(`app_settings?select=${encodeURIComponent(column)}&limit=0`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isMissingColumnMessage(message) || message.startsWith("Supabase 400"))
        missing.push(column);
    }
  }
  return { database: missing.length ? "missing_columns" : "ok", project, missing_columns: missing };
}

export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: { "cache-control": "no-store", ...(init.headers ?? {}) },
  });
}

export function errorResponse(error: unknown) {
  console.error(error);
  if (error instanceof DatabaseUnavailableError) {
    return json({ error: error.message }, { status: 503 });
  }
  const message = error instanceof Error ? error.message : "Terjadi kesalahan server";
  // Validation raised by the withdrawal trigger is a user-facing 400, not a server error.
  const minimum = message.match(/"message"\s*:\s*"(Minimal penarikan[^"]*)"/);
  if (minimum) return json({ error: minimum[1] }, { status: 400 });
  const duplicateGmail = message.match(
    /"message"\s*:\s*"(Gmail ini sudah diklaim oleh akun lain|Gmail ini sudah pernah dikirim dan tidak dapat dikirim ulang|Gmail yang sama tidak boleh dikirim lebih dari satu kali)"/,
  );
  if (duplicateGmail) return json({ error: duplicateGmail[1] }, { status: 409 });
  const generatedGmailSchemaUnavailable =
    message.startsWith("Supabase ") &&
    /generated_gmail_claims|claim_gmail_stock_batch/i.test(message);
  if (generatedGmailSchemaUnavailable) {
    return json(
      {
        error:
          "Fitur Gmail stok belum siap pada database. Silahkan Hubungi Admin untuk menerapkan migration database.",
      },
      { status: 503 },
    );
  }
  // Wrong/rotated key on the host (e.g. Vercel env) makes every query fail with 401.
  if (isInvalidDatabaseKeyMessage(message)) {
    return json({ error: INVALID_DATABASE_KEY_MESSAGE }, { status: 503 });
  }
  if (isMissingColumnMessage(message)) {
    return json({ error: MISSING_MIGRATION_MESSAGE }, { status: 503 });
  }
  // Never leak raw database errors to the browser.
  const safe = message.startsWith("Supabase ") ? "Terjadi kesalahan pada database server" : message;
  return json({ error: safe }, { status: 500 });
}
