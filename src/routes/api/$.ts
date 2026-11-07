import { createFileRoute } from "@tanstack/react-router";
import {
  clearSessionCookie,
  createSession,
  errorResponse,
  getCurrentUser,
  getSettings,
  hashPassword,
  json,
  requireAdmin,
  requireUser,
  supabaseFetch,
  verifyPassword,
  sessionTokenHash,
} from "../../server/supabase";
import { rateLimit } from "../../server/rate-limit";

type Body = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const booleanValue = (value: unknown, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (value == null) return fallback;
  return ["true", "1", "yes", "on"].includes(String(value).trim().toLowerCase());
};
const paymentMethods = ["DANA", "OVO", "GoPay", "ShopeePay", "BCA", "BRI", "Mandiri"];
const paymentModes = ["all", "dana_only"] as const;
const paymentKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
function canonicalPaymentFees(value: unknown, fallback: number) {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return Object.fromEntries(
    paymentMethods.map((method) => {
      const found = Object.entries(source).find(([key]) => paymentKey(key) === paymentKey(method));
      return [method, normalizeFee(found?.[1] ?? fallback)];
    }),
  );
}
// Fee selalu kelipatan Rp1.000 (boleh 0 dan di bawah Rp10.000).
const FEE_STEP = 1000;
const FIXED_MIN_WITHDRAWAL = 4000;
function normalizeFee(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount / FEE_STEP) * FEE_STEP;
}
function isValidFee(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) && amount >= 0 && amount % FEE_STEP === 0;
}
// Semua metode minimal Rp4.000; DANA dapat memakai batas admin yang lebih tinggi.
function withdrawalMinimums(adminMin: unknown) {
  const dana = Math.max(FIXED_MIN_WITHDRAWAL, Math.floor(Number(adminMin ?? 0)) || 0);
  return Object.fromEntries(
    paymentMethods.map((method) => [method, method === "DANA" ? dana : FIXED_MIN_WITHDRAWAL]),
  ) as Record<string, number>;
}
function canonicalSupportChannels(value: unknown) {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const legacyWhatsApp = Array.isArray(source["whatsapp"]) ? source["whatsapp"] : [];
  const legacyTelegram = Array.isArray(source["telegram"]) ? source["telegram"] : [];
  const rawAdmins = Array.isArray(source["admins"]) ? source["admins"] : [];
  const admins = [0, 1].map((index) => {
    const item =
      rawAdmins[index] && typeof rawAdmins[index] === "object"
        ? (rawAdmins[index] as Record<string, unknown>)
        : {};
    return {
      name: text(item["name"]) || `Admin ${index + 1}`,
      whatsapp: text(item["whatsapp"]) || text(legacyWhatsApp[index]),
      telegram: text(item["telegram"]) || text(legacyTelegram[index]),
      enabled: item["enabled"] !== false,
    };
  });
  return {
    whatsappEnabled: source["whatsappEnabled"] !== false && source["whatsapp_enabled"] !== false,
    telegramEnabled: source["telegramEnabled"] !== false && source["telegram_enabled"] !== false,
    admins,
  };
}
const idFromPath = (path: string) => path.split("/").filter(Boolean).at(-1) ?? "";

async function body(request: Request): Promise<Body> {
  try {
    return (await request.json()) as Body;
  } catch {
    return {};
  }
}

async function login(request: Request) {
  const payload = await body(request);
  const username = text(payload["username"]);
  const password = typeof payload["password"] === "string" ? payload["password"] : "";
  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username) || password.length < 6)
    return json({ error: "Username atau password tidak valid" }, { status: 400 });

  const adminUsername = process.env["ADMIN_USERNAME"] ?? "";
  const adminPassword = process.env["ADMIN_PASSWORD"] ?? "";
  const isAdminCredentials = Boolean(
    adminUsername && adminPassword && username === adminUsername && password === adminPassword,
  );
  let users = await supabaseFetch<Record<string, unknown>[]>(
    `profiles?select=*&username=eq.${encodeURIComponent(username)}&limit=1`,
  );
  let user = users[0];
  if (isAdminCredentials) {
    if (!user) {
      const hashed = await hashPassword(password);
      const created = await supabaseFetch<Record<string, unknown>[]>("profiles", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          username,
          display_name: "Administrator",
          password_hash: hashed.hash,
          password_salt: hashed.salt,
          role: "admin",
        }),
      });
      users = created ?? [];
      user =
        users[0] ??
        (
          await supabaseFetch<Record<string, unknown>[]>(
            `profiles?select=*&username=eq.${encodeURIComponent(username)}&limit=1`,
          )
        )[0];
    } else if (user["role"] !== "admin") {
      return json(
        { error: "Username admin sudah dipakai akun user. Gunakan username admin khusus." },
        { status: 409 },
      );
    }
  } else {
    if (user && !user["password_hash"])
      return json(
        {
          error:
            "Akun ini sudah dipindahkan ke sistem baru. Hubungi admin untuk mendapatkan password baru.",
        },
        { status: 403 },
      );
    if (
      !user ||
      !(await verifyPassword(
        password,
        String(user["password_hash"]),
        String(user["password_salt"]),
      ))
    )
      return json({ error: "Username atau password salah" }, { status: 401 });
  }
  if (!user) return json({ error: "Username atau password salah" }, { status: 401 });
  if (user["is_blocked"] === true)
    return json({ error: "Akun ini diblokir admin" }, { status: 403 });
  const session = await createSession(String(user["id"]));
  return json({ user: publicUser(user) }, { headers: { "set-cookie": session.cookie } });
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${(local ?? "").slice(0, 1)}***@${domain ?? ""}`;
}

async function otpDigest(registrationId: string, code: string) {
  const secret =
    process.env["SUPABASE_SECRET_KEY"] ??
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
    process.env["SUPABASE_KEY"] ??
    process.env["SUPABASE_API_KEY"] ??
    "";
  if (!secret) throw new Error("Kunci rahasia server belum dikonfigurasi");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${registrationId}:${code}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sendRegistrationOtp(registration: {
  registration_id: string;
  username: string;
  email: string;
  display_name: string;
  password_hash: string;
  password_salt: string;
}) {
  const apiKey = process.env["RESEND_API_KEY"] ?? "";
  const from = process.env["AUTH_EMAIL_FROM"] ?? "";
  if (!apiKey || !from)
    throw new Error("Pengiriman OTP belum dikonfigurasi (RESEND_API_KEY / AUTH_EMAIL_FROM)");
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  await supabaseFetch("registration_otps", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      ...registration,
      code_hash: await otpDigest(registration.registration_id, code),
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      attempts: 0,
      created_at: new Date().toISOString(),
    }),
  });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [registration.email],
      subject: "Kode verifikasi pendaftaran Tachi",
      text: `Kode OTP pendaftaran kamu: ${code}. Kode berlaku 10 menit. Jangan bagikan kode ini kepada siapa pun.`,
    }),
  });
  if (!response.ok) {
    await supabaseFetch(
      `registration_otps?registration_id=eq.${encodeURIComponent(registration.registration_id)}`,
      { method: "DELETE" },
    );
    console.error("Resend OTP gagal:", response.status, await response.text());
    throw new Error("Email OTP gagal dikirim. Coba lagi nanti.");
  }
}

async function resendRegistrationOtp(request: Request) {
  const payload = await body(request);
  const registrationId = text(payload["registrationId"]);
  if (!/^[0-9a-f-]{36}$/i.test(registrationId))
    return json({ error: "Pendaftaran OTP tidak valid" }, { status: 400 });
  const rows = await supabaseFetch<Record<string, unknown>[]>(
    `registration_otps?select=registration_id,username,email,display_name,password_hash,password_salt,expires_at&registration_id=eq.${encodeURIComponent(registrationId)}&limit=1`,
  );
  const pending = rows[0];
  if (!pending || Date.parse(String(pending["expires_at"])) <= Date.now())
    return json(
      { error: "Sesi pendaftaran sudah kedaluwarsa. Silakan daftar ulang." },
      { status: 410 },
    );
  await sendRegistrationOtp({
    registration_id: registrationId,
    username: String(pending["username"]),
    email: String(pending["email"]),
    display_name: String(pending["display_name"]),
    password_hash: String(pending["password_hash"]),
    password_salt: String(pending["password_salt"]),
  });
  return json({
    registrationId,
    otpRequired: true,
    emailHint: maskEmail(String(pending["email"])),
  });
}

async function verifyRegistrationOtp(request: Request) {
  const payload = await body(request);
  const registrationId = text(payload["registrationId"]);
  const code = text(payload["code"]);
  if (!/^[0-9a-f-]{36}$/i.test(registrationId) || !/^\d{6}$/.test(code))
    return json({ error: "Kode OTP tidak valid" }, { status: 400 });
  const rows = await supabaseFetch<Record<string, unknown>[]>(
    `registration_otps?select=*&registration_id=eq.${encodeURIComponent(registrationId)}&limit=1`,
  );
  const pending = rows[0];
  if (
    !pending ||
    Number(pending["attempts"]) >= 5 ||
    Date.parse(String(pending["expires_at"])) <= Date.now()
  ) {
    await supabaseFetch(
      `registration_otps?registration_id=eq.${encodeURIComponent(registrationId)}`,
      { method: "DELETE" },
    );
    return json({ error: "Kode OTP tidak valid atau sudah kedaluwarsa" }, { status: 401 });
  }
  if ((await otpDigest(registrationId, code)) !== String(pending["code_hash"])) {
    await supabaseFetch(
      `registration_otps?registration_id=eq.${encodeURIComponent(registrationId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ attempts: Number(pending["attempts"]) + 1 }),
      },
    );
    return json({ error: "Kode OTP salah" }, { status: 401 });
  }
  const username = String(pending["username"]);
  const email = String(pending["email"]);
  const [existingUsername, existingEmail] = await Promise.all([
    supabaseFetch<Record<string, unknown>[]>(
      `profiles?select=id&username=eq.${encodeURIComponent(username)}&limit=1`,
    ),
    supabaseFetch<Record<string, unknown>[]>(
      `profiles?select=id&email=ilike.${encodeURIComponent(email)}&limit=1`,
    ),
  ]);
  if (existingUsername.length || existingEmail.length) {
    await supabaseFetch(
      `registration_otps?registration_id=eq.${encodeURIComponent(registrationId)}`,
      { method: "DELETE" },
    );
    return json(
      { error: existingUsername.length ? "Username sudah dipakai" : "Email sudah dipakai" },
      { status: 409 },
    );
  }
  const created = await supabaseFetch<Record<string, unknown>[]>("profiles", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      username,
      email,
      display_name: String(pending["display_name"]),
      password_hash: String(pending["password_hash"]),
      password_salt: String(pending["password_salt"]),
    }),
  });
  const user = created[0];
  if (!user) return json({ error: "Akun gagal dibuat, silakan coba lagi" }, { status: 500 });
  await supabaseFetch(
    `registration_otps?registration_id=eq.${encodeURIComponent(registrationId)}`,
    { method: "DELETE" },
  );
  const session = await createSession(String(user["id"]));
  return json(
    { user: publicUser(user) },
    { status: 201, headers: { "set-cookie": session.cookie } },
  );
}

async function changeOwnPassword(request: Request) {
  const user = await requireUser(request);
  const payload = await body(request);
  const oldPassword = typeof payload["oldPassword"] === "string" ? payload["oldPassword"] : "";
  const newPassword = typeof payload["newPassword"] === "string" ? payload["newPassword"] : "";
  if (newPassword.length < 6 || newPassword.length > 128)
    return json({ error: "Password baru harus terdiri dari 6-128 karakter" }, { status: 400 });
  if (!user["password_hash"] || !user["password_salt"])
    return json({ error: "Akun belum memiliki password. Hubungi admin." }, { status: 409 });
  if (
    !(await verifyPassword(
      oldPassword,
      String(user["password_hash"]),
      String(user["password_salt"]),
    ))
  )
    return json({ error: "Password lama salah" }, { status: 401 });
  const hashed = await hashPassword(newPassword);
  await supabaseFetch(`profiles?id=eq.${encodeURIComponent(String(user["id"]))}`, {
    method: "PATCH",
    body: JSON.stringify({ password_hash: hashed.hash, password_salt: hashed.salt }),
  });
  await supabaseFetch(`sessions?profile_id=eq.${encodeURIComponent(String(user["id"]))}`, {
    method: "DELETE",
  });
  const session = await createSession(String(user["id"]));
  return json({ ok: true }, { headers: { "set-cookie": session.cookie } });
}

async function register(request: Request) {
  const payload = await body(request);
  const username = text(payload["username"]);
  const displayName = text(payload["displayName"]) || text(payload["name"]);
  const email = text(payload["email"]).toLowerCase();
  const password = typeof payload["password"] === "string" ? payload["password"] : "";
  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username))
    return json(
      { error: "Username 3-30 karakter, hanya huruf, angka, titik, dan underscore" },
      { status: 400 },
    );
  if (password.length < 6) return json({ error: "Password minimal 6 karakter" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return json({ error: "Masukkan alamat email yang valid" }, { status: 400 });
  if (process.env["ADMIN_USERNAME"] && username === process.env["ADMIN_USERNAME"])
    return json({ error: "Username tersebut dicadangkan untuk admin" }, { status: 409 });
  const [existingUsername, existingEmail] = await Promise.all([
    supabaseFetch<Record<string, unknown>[]>(
      `profiles?select=id&username=eq.${encodeURIComponent(username)}&limit=1`,
    ),
    supabaseFetch<Record<string, unknown>[]>(
      `profiles?select=id&email=ilike.${encodeURIComponent(email)}&limit=1`,
    ),
  ]);
  if (existingUsername.length) return json({ error: "Username sudah dipakai" }, { status: 409 });
  if (existingEmail.length) return json({ error: "Email sudah dipakai" }, { status: 409 });
  await supabaseFetch(
    `registration_otps?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`,
    {
      method: "DELETE",
    },
  );
  const hashed = await hashPassword(password);
  const registration = {
    registration_id: crypto.randomUUID(),
    username,
    email,
    display_name: displayName.slice(0, 100),
    password_hash: hashed.hash,
    password_salt: hashed.salt,
  };
  await sendRegistrationOtp(registration);
  return json({
    registrationId: registration.registration_id,
    otpRequired: true,
    emailHint: maskEmail(email),
  });
}

function publicUser(user: Record<string, unknown>) {
  return {
    id: user["id"],
    username: user["username"],
    displayName: user["display_name"],
    avatarUrl: text(user["avatar_url"]),
    role: user["role"],
    balance: Number(user["balance"] ?? 0),
    withdrawn: Number(user["withdrawn"] ?? 0),
    wallet: {
      bank: text(user["wallet_bank"]) || "DANA",
      name: text(user["wallet_name"]),
      number: text(user["wallet_number"]),
    },
  };
}

async function userDeposits(request: Request, admin = false) {
  const user = admin ? await requireAdmin(request) : await requireUser(request);
  const query = admin
    ? "deposits?select=*,profiles!deposits_user_id_fkey(username,display_name)&order=created_at.desc&limit=500"
    : `deposits?select=*&user_id=eq.${encodeURIComponent(String(user["id"]))}&order=created_at.desc&limit=100`;
  const rows = await supabaseFetch<Record<string, unknown>[]>(query);
  return json({ deposits: rows });
}

async function userDepositDetail(request: Request, id: string) {
  const user = await requireUser(request);
  const userFilter = `user_id=eq.${encodeURIComponent(String(user["id"]))}&limit=1`;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
  const query = isUuid
    ? `deposits?select=*&id=eq.${encodeURIComponent(id)}&${userFilter}`
    : `deposits?select=*&transaction_number=eq.${encodeURIComponent(id)}&${userFilter}`;
  const rows = await supabaseFetch<Record<string, unknown>[]>(query);
  if (!rows[0]) return json({ error: "Transaksi tidak ditemukan" }, { status: 404 });
  const settings = await getSettings();
  return json({
    deposit: rows[0],
    settings: {
      campaign_password: settings?.["campaign_password"] ?? "",
      pw_text: settings?.["pw_text"] ?? "PW",
      pw_enabled: settings?.["pw_enabled"] !== false,
    },
  });
}

async function adminUsers(request: Request) {
  await requireAdmin(request);
  const [users, withoutPassword] = await Promise.all([
    supabaseFetch<Record<string, unknown>[]>(
      "profiles?select=id,username,display_name,role,balance,withdrawn,wallet_bank,wallet_name,wallet_number,is_blocked&role=eq.user&order=created_at.desc&limit=500",
    ),
    // Accounts moved from the old database have no password until an admin sets one.
    supabaseFetch<{ id: string }[]>("profiles?select=id&role=eq.user&password_hash=is.null"),
  ]);
  const pending = new Set(withoutPassword.map((row) => row.id));
  return json({
    users: users.map((user) => ({ ...user, needs_password: pending.has(String(user["id"])) })),
  });
}

async function adjustUserBalance(request: Request, id: string) {
  await requireAdmin(request);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "User tidak valid" }, { status: 400 });
  const payload = await body(request);
  const amount = Number(payload["amount"]);
  if (!Number.isSafeInteger(amount) || amount === 0) {
    return json(
      { error: "Nominal koreksi harus bilangan bulat dan tidak boleh nol" },
      { status: 400 },
    );
  }
  const users = await supabaseFetch<Record<string, unknown>[]>(
    `profiles?select=id,balance&role=eq.user&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  const user = users[0];
  if (!user) return json({ error: "User tidak ditemukan" }, { status: 404 });
  const currentBalance = Number(user["balance"] ?? 0);
  const nextBalance = currentBalance + amount;
  if (!Number.isSafeInteger(nextBalance) || nextBalance < 0) {
    return json(
      { error: "Saldo user tidak boleh minus atau melebihi batas aman" },
      { status: 400 },
    );
  }
  const updated = await supabaseFetch<Record<string, unknown>[]>(
    `profiles?id=eq.${encodeURIComponent(id)}&role=eq.user&balance=eq.${encodeURIComponent(String(currentBalance))}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ balance: nextBalance }),
    },
  );
  if (!updated.length) {
    return json(
      { error: "Saldo berubah oleh admin lain, silakan muat ulang lalu coba lagi" },
      { status: 409 },
    );
  }
  return json({ ok: true, user: updated[0], previous_balance: currentBalance, adjustment: amount });
}

type LeaderboardRow = {
  rank: number;
  username: string;
  display_name: string;
  avatar_url: string;
  approved_gmails: number;
  deposit_count: number;
  earnings: number;
};
type LeaderboardResult = {
  leaderboard: LeaderboardRow[];
  me: LeaderboardRow | null;
  totals: { approved_gmails: number; depositors: number; deposits: number };
};

function leaderboardSince(period: string) {
  if (period === "today") {
    // Hari ini mengikuti WIB (sama dengan kuota harian), bukan tengah malam UTC.
    const jakartaDate = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return new Date(`${jakartaDate}T00:00:00+07:00`).toISOString();
  }
  if (period === "7d") return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (period === "30d") return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return "";
}

// Cadangan bila migration leaderboard_stats belum dijalankan: baca semua setoran
// diterima per halaman (tanpa batas 5000 baris) lalu hitung di server.
async function leaderboardFromDeposits(
  since: string,
  currentUserId: string,
): Promise<LeaderboardResult> {
  const createdFilter = since ? `&created_at=gte.${encodeURIComponent(since)}` : "";
  const pageSize = 1000;
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; offset < 100_000; offset += pageSize) {
    const page = await supabaseFetch<Record<string, unknown>[]>(
      `deposits?select=user_id,accepted_count,accepted_emails,earned,profiles(username,display_name,avatar_url,role,is_blocked)&status=eq.diterima${createdFilter}&order=created_at.asc,id.asc&limit=${pageSize}&offset=${offset}`,
    );
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  const totals = new Map<string, LeaderboardRow & { user_id: string }>();
  for (const row of rows) {
    const profile =
      row["profiles"] && typeof row["profiles"] === "object"
        ? (row["profiles"] as Record<string, unknown>)
        : {};
    if (text(profile["role"]) !== "user" || profile["is_blocked"] === true) continue;
    const username = text(profile["username"]);
    if (!username) continue;
    const acceptedEmails = Array.isArray(row["accepted_emails"]) ? row["accepted_emails"] : [];
    const approved =
      acceptedEmails.length || Math.max(0, Math.floor(Number(row["accepted_count"] ?? 0)));
    if (approved < 1) continue;
    const userId = String(row["user_id"] ?? username);
    const previous = totals.get(userId) ?? {
      rank: 0,
      user_id: userId,
      username,
      display_name: text(profile["display_name"]) || username,
      avatar_url: text(profile["avatar_url"]),
      approved_gmails: 0,
      deposit_count: 0,
      earnings: 0,
    };
    previous.approved_gmails += approved;
    previous.deposit_count += 1;
    previous.earnings += Math.max(0, Math.floor(Number(row["earned"] ?? 0)));
    totals.set(userId, previous);
  }
  const ranked = [...totals.values()]
    .sort(
      (a, b) =>
        b.approved_gmails - a.approved_gmails ||
        b.deposit_count - a.deposit_count ||
        a.username.localeCompare(b.username),
    )
    .map((item, index) => ({ ...item, rank: index + 1 }));
  const strip = ({ user_id: _userId, ...item }: LeaderboardRow & { user_id: string }) => item;
  const me = ranked.find((item) => item.user_id === currentUserId);
  return {
    leaderboard: ranked.slice(0, 50).map(strip),
    me: me ? strip(me) : null,
    totals: {
      approved_gmails: ranked.reduce((sum, item) => sum + item.approved_gmails, 0),
      depositors: ranked.length,
      deposits: ranked.reduce((sum, item) => sum + item.deposit_count, 0),
    },
  };
}

async function leaderboard(request: Request) {
  const currentUser = await requireUser(request);
  const requestedPeriod = new URL(request.url).searchParams.get("period") || "7d";
  const period = ["today", "7d", "30d", "all"].includes(requestedPeriod) ? requestedPeriod : "7d";
  const since = leaderboardSince(period);
  const currentUserId = String(currentUser["id"] ?? "");
  let result: LeaderboardResult;
  try {
    // Agregasi dilakukan di database (RPC leaderboard_stats) langsung dari tabel deposits.
    const data = await supabaseFetch<Partial<LeaderboardResult>>("rpc/leaderboard_stats", {
      method: "POST",
      body: JSON.stringify({
        p_since: since || null,
        p_user_id: currentUserId || null,
        p_limit: 50,
      }),
    });
    // user_id hanya dipakai di database; jangan dikirim ke user lain.
    const publicRow = (row: LeaderboardRow & { user_id?: string }): LeaderboardRow => {
      const { user_id: _userId, ...rest } = row;
      return rest;
    };
    result = {
      leaderboard: Array.isArray(data?.leaderboard) ? data.leaderboard.map(publicRow) : [],
      me: data?.me ? publicRow(data.me) : null,
      totals: data?.totals ?? { approved_gmails: 0, depositors: 0, deposits: 0 },
    };
  } catch (error) {
    // Hanya fallback bila fungsi belum ada; error database lain tetap dilaporkan.
    const message = error instanceof Error ? error.message : "";
    if (!/PGRST202|leaderboard_stats|Could not find the function/i.test(message)) throw error;
    result = await leaderboardFromDeposits(since, currentUserId);
  }
  return json({ ...result, period, updated_at: new Date().toISOString() });
}

async function updateProfileAvatar(request: Request) {
  const user = await requireUser(request);
  const payload = await body(request);
  const avatarUrl = text(payload["avatarUrl"]);
  const avatarMatch = avatarUrl.match(/^data:image\/(png|jpe?g|webp|gif);base64,([a-z0-9+/]+=*)$/i);
  const base64Payload = avatarMatch?.[2] ?? "";
  const padding = base64Payload.endsWith("==") ? 2 : base64Payload.endsWith("=") ? 1 : 0;
  const decodedBytes = Math.max(0, Math.floor((base64Payload.length * 3) / 4) - padding);
  if (avatarUrl && (!avatarMatch || decodedBytes > 1_000_000)) {
    return json(
      { error: "Foto harus berupa PNG, JPG, WEBP, atau GIF maksimal 1 MB" },
      { status: 400 },
    );
  }
  const updated = await supabaseFetch<Record<string, unknown>[]>(
    `profiles?id=eq.${encodeURIComponent(String(user["id"]))}&select=id,username,display_name,avatar_url,role,balance,withdrawn,wallet_bank,wallet_name,wallet_number`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ avatar_url: avatarUrl }),
    },
  );
  if (!updated.length) return json({ error: "Foto profil gagal disimpan" }, { status: 500 });
  return json({ user: publicUser(updated[0]) });
}

async function resetUserPassword(request: Request, id: string) {
  await requireAdmin(request);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "User tidak valid" }, { status: 400 });
  const payload = await body(request);
  const password = typeof payload["password"] === "string" ? payload["password"] : "";
  if (password.length < 6 || password.length > 128)
    return json({ error: "Password baru harus terdiri dari 6-128 karakter" }, { status: 400 });
  const hashed = await hashPassword(password);
  const updated = await supabaseFetch<Record<string, unknown>[]>(
    `profiles?id=eq.${encodeURIComponent(id)}&role=eq.user`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ password_hash: hashed.hash, password_salt: hashed.salt }),
    },
  );
  if (!updated?.length) return json({ error: "User tidak ditemukan" }, { status: 404 });
  await supabaseFetch(`sessions?profile_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  return json({ ok: true });
}

async function createDeposit(request: Request) {
  const [tokenHash, payload] = await Promise.all([sessionTokenHash(request), body(request)]);
  if (!tokenHash) return json({ error: "Anda harus login terlebih dahulu" }, { status: 401 });
  const emails = Array.isArray(payload["emails"])
    ? payload["emails"].map(text).filter(Boolean)
    : [];
  // Login, blocked, settings, duplicate, daily-limit checks and the insert run in one RPC.
  const result = await supabaseFetch<Record<string, unknown>>("rpc/submit_deposit_atomic", {
    method: "POST",
    body: JSON.stringify({
      p_token_hash: tokenHash,
      p_emails: emails,
      p_jalur: text(payload["jalur"]).trim().toUpperCase(),
      p_campaign_password: text(payload["campaignPassword"]),
    }),
  });
  const status = Number(result?.["status"] ?? 500);
  const { status: _status, ...rest } = result ?? {};
  return json(rest, { status: Number.isInteger(status) && status >= 200 ? status : 500 });
}

async function approveDeposit(request: Request, id: string) {
  const admin = await requireAdmin(request);
  const payload = await body(request);
  const acceptedEmails = Array.isArray(payload["acceptedEmails"])
    ? payload["acceptedEmails"].map(text).filter(Boolean)
    : null;
  const result = await supabaseFetch<{ ok: boolean; earned: number; error_code: string | null }[]>(
    "rpc/approve_deposit_atomic",
    {
      method: "POST",
      body: JSON.stringify({
        p_deposit_id: id,
        p_admin_id: admin["id"],
        p_accepted_emails: acceptedEmails,
      }),
    },
  );
  const outcome = result[0];
  if (!outcome?.ok)
    return json({ error: "Setoran tidak ditemukan atau sudah diproses" }, { status: 409 });
  return json({ ok: true, earned: Number(outcome.earned ?? 0) });
}

async function rejectDeposit(request: Request, id: string) {
  const admin = await requireAdmin(request);
  const payload = await body(request);
  const reason = text(payload["reason"]);
  if (!reason) return json({ error: "Alasan penolakan wajib diisi" }, { status: 400 });
  const rejectedEmails = Array.isArray(payload["rejectedEmails"])
    ? payload["rejectedEmails"].map(text).filter(Boolean)
    : null;
  let result: { ok: boolean; error_code: string | null }[];
  try {
    result = await supabaseFetch<{ ok: boolean; error_code: string | null }[]>(
      "rpc/reject_deposit_atomic",
      {
        method: "POST",
        body: JSON.stringify({
          p_deposit_id: id,
          p_admin_id: admin["id"],
          p_reason: reason,
          p_rejected_emails: rejectedEmails,
        }),
      },
    );
  } catch (error) {
    // Older deployments still expose the 3-argument RPC. Keep full-deposit
    // rejection working while the latest migration is being applied; partial
    // Gmail selection must not silently reject the entire transaction.
    const detail = error instanceof Error ? error.message : String(error);
    const missingLatestRpc =
      detail.startsWith("Supabase 404") && /reject_deposit_atomic/i.test(detail);
    if (!missingLatestRpc) throw error;

    const deposits = await supabaseFetch<{ emails?: unknown; status?: unknown }[]>(
      `deposits?select=emails,status&id=eq.${encodeURIComponent(id)}&limit=1`,
    );
    const deposit = deposits[0];
    const allEmails = Array.isArray(deposit?.emails)
      ? deposit.emails.map(text).filter(Boolean)
      : [];
    const selected =
      rejectedEmails?.map((email) => email.toLowerCase()) ??
      allEmails.map((email) => email.toLowerCase());
    const allSelected =
      selected.length === allEmails.length &&
      allEmails.every((email) => selected.includes(email.toLowerCase()));
    if (!allSelected) {
      return json(
        {
          error:
            "Database belum memakai migration penolakan per-Gmail. Terapkan migration terbaru sebelum menolak sebagian Gmail.",
        },
        { status: 503 },
      );
    }
    result = await supabaseFetch<{ ok: boolean; error_code: string | null }[]>(
      "rpc/reject_deposit_atomic",
      {
        method: "POST",
        body: JSON.stringify({ p_deposit_id: id, p_admin_id: admin["id"], p_reason: reason }),
      },
    );
  }
  if (!result[0]?.ok)
    return json({ error: "Setoran tidak ditemukan atau sudah diproses" }, { status: 409 });
  return json({ ok: true });
}

// Gmail that was already handed out (claimed by a user or submitted in a deposit)
// must never return to the stock, even when the admin saves an outdated list.
async function filterUndistributedStock(emails: string[]): Promise<string[]> {
  const seen = new Set<string>();
  const unique = emails.filter((email) => {
    const key = email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const used = new Set<string>();
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100).map((email) => email.toLowerCase());
    const list = encodeURIComponent(`(${chunk.map((e) => `"${e.replace(/"/g, "")}"`).join(",")})`);
    const rows = await supabaseFetch<Record<string, unknown>[]>(
      `generated_gmail_claims?select=normalized_gmail&normalized_gmail=in.${list}`,
    );
    for (const row of rows) used.add(text(row["normalized_gmail"]).toLowerCase());
  }
  return unique.filter((email) => !used.has(email.toLowerCase()));
}

async function updateSettings(request: Request) {
  await requireAdmin(request);
  const payload = await body(request);
  const current = await getSettings();
  const stock = Array.isArray(payload["gmailStock"])
    ? await filterUndistributedStock(payload["gmailStock"].map(text).filter(Boolean))
    : [];
  const numberOrZero = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const incomingFee = payload["fee"] ?? current?.["fee"] ?? 0;
  const legacyRate = payload["rate"];
  const parseRate = (value: unknown) => {
    if (typeof value === "string" && !value.trim()) return Number.NaN;
    if (typeof value !== "number" && typeof value !== "string") return Number.NaN;
    return Number(value);
  };
  const pwRate = parseRate(
    payload["pwRate"] ?? legacyRate ?? current?.["pw_rate"] ?? current?.["rate"] ?? 4500,
  );
  const captchaRate = parseRate(
    payload["captchaRate"] ?? legacyRate ?? current?.["captcha_rate"] ?? current?.["rate"] ?? 4500,
  );
  const incomingPaymentFees = payload["paymentFees"] ?? current?.["payment_fees"] ?? {};
  const rawFees =
    incomingPaymentFees && typeof incomingPaymentFees === "object"
      ? Object.values(incomingPaymentFees as Record<string, unknown>)
      : [];
  if (!isValidFee(incomingFee) || rawFees.some((value) => !isValidFee(value)))
    return json(
      { error: "Fee harus kelipatan Rp1.000 (contoh: 0, 1.000, 2.000)" },
      { status: 400 },
    );
  if (
    !Number.isSafeInteger(pwRate) ||
    pwRate < 0 ||
    !Number.isSafeInteger(captchaRate) ||
    captchaRate < 0
  )
    return json(
      { error: "Harga PW dan CAPTCHA harus bilangan bulat non-negatif yang valid." },
      { status: 400 },
    );
  const allowed = {
    rate: pwRate,
    pw_rate: pwRate,
    captcha_rate: captchaRate,
    min_withdrawal: Math.max(
      FIXED_MIN_WITHDRAWAL,
      numberOrZero(payload["minWithdrawal"] ?? current?.["min_withdrawal"]),
    ),
    fee: normalizeFee(payload["fee"] ?? current?.["fee"]),
    payment_fees: canonicalPaymentFees(
      payload["paymentFees"] ?? current?.["payment_fees"],
      normalizeFee(payload["fee"] ?? current?.["fee"]),
    ),
    campaign_password: text(payload["campaignPassword"] ?? current?.["campaign_password"]),
    pw_text: text(payload["pwText"] ?? current?.["pw_text"]) || "PW",
    pw_enabled: booleanValue(payload["pwEnabled"], current?.["pw_enabled"] !== false),
    captcha_enabled: booleanValue(payload["captchaEnabled"], current?.["captcha_enabled"] === true),
    captcha_text: text(payload["captchaText"] ?? current?.["captcha_text"]) || "CAPTCHA",
    store_open: booleanValue(payload["storeOpen"], current?.["store_open"] !== false),
    withdraw_open: booleanValue(payload["withdrawOpen"], current?.["withdraw_open"] !== false),
    checker_open: booleanValue(payload["checkerOpen"], current?.["checker_open"] !== false),
    daily_limit: numberOrZero(payload["dailyLimit"] ?? current?.["daily_limit"]),
    batch_limit: numberOrZero(payload["batchLimit"] ?? current?.["batch_limit"]),
    announcement: text(payload["announcement"] ?? current?.["announcement"]),
    information_cards: Array.isArray(payload["informationCards"])
      ? payload["informationCards"]
          .filter((item) => item && typeof item === "object")
          .map((item) => {
            const card = item as Record<string, unknown>;
            return {
              title: text(card["title"]).slice(0, 80),
              info: text(card["info"]).slice(0, 1000),
              category: text(card["category"]).slice(0, 40) || "Info",
            };
          })
          .map((item) => ({ ...item, title: item.title || item.category || "Info" }))
          .filter((item) => item.info)
          .slice(0, 12)
      : Array.isArray(current?.["information_cards"])
        ? current["information_cards"]
        : [],
    rules_text: text(payload["rulesText"] ?? current?.["rules_text"]),
    payment_mode: paymentModes.includes(payload["paymentMode"] as (typeof paymentModes)[number])
      ? payload["paymentMode"]
      : current?.["payment_mode"] === "dana_only"
        ? "dana_only"
        : "all",
    support_channels: canonicalSupportChannels(
      payload["supportChannels"] ?? current?.["support_channels"],
    ),
    auto_stock_enabled: booleanValue(
      payload["autoStockEnabled"],
      current?.["auto_stock_enabled"] === true,
    ),
    gmail_stock: Array.isArray(payload["gmailStock"])
      ? stock
      : Array.isArray(current?.["gmail_stock"])
        ? current["gmail_stock"]
        : [],
  };
  const patchSettings = async (values: Record<string, unknown>) => {
    await supabaseFetch("app_settings?id=eq.1", {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(values),
    });
  };
  const {
    payment_fees: paymentFees,
    information_cards: informationCards,
    rules_text: rulesText,
    support_channels: supportChannels,
    payment_mode: paymentMode,
    ...coreSettings
  } = allowed;
  // Satu request untuk semua kolom supaya simpan terasa instan; fallback per kolom
  // hanya kalau ada kolom opsional yang belum dimigrasi.
  let savedInOneRequest = false;
  try {
    await patchSettings({
      ...coreSettings,
      payment_fees: paymentFees,
      information_cards: informationCards,
      rules_text: rulesText,
      support_channels: supportChannels,
      payment_mode: paymentMode,
      store_closed_reason: text(
        payload["storeClosedReason"] ?? current?.["store_closed_reason"],
      ).slice(0, 300),
    });
    savedInOneRequest = true;
  } catch {
    savedInOneRequest = false;
  }
  if (!savedInOneRequest) {
    await patchSettings(coreSettings);
    for (const optionalSetting of [
      ["payment_fees", paymentFees],
      ["information_cards", informationCards],
      ["rules_text", rulesText],
      ["support_channels", supportChannels],
      ["payment_mode", paymentMode],
      [
        "store_closed_reason",
        text(payload["storeClosedReason"] ?? current?.["store_closed_reason"]).slice(0, 300),
      ],
      ["information_cards", allowed.information_cards],
    ] as const) {
      try {
        await patchSettings({ [optionalSetting[0]]: optionalSetting[1] });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const optionalColumnMissing =
          message.includes("PGRST204") ||
          (message.includes("400") && message.includes(optionalSetting[0]));
        if (
          optionalColumnMissing &&
          optionalSetting[0] === "information_cards" &&
          Array.isArray(optionalSetting[1]) &&
          optionalSetting[1].length
        ) {
          throw new Error(
            "Konfigurasi info belum tersimpan karena migration information_cards belum diterapkan di database.",
          );
        }
        if (
          !optionalColumnMissing ||
          (optionalSetting[0] === "store_closed_reason" && optionalSetting[1])
        )
          throw error;
      }
    }
  }
  const saved = await getSettings();
  if (!saved) {
    throw new Error(
      "Konfigurasi app_settings tidak ditemukan. Jalankan migration Supabase terlebih dahulu.",
    );
  }
  return json({ settings: saved });
}

function userSettings(settings: Record<string, unknown> | null) {
  if (!settings) return null;
  const { gmail_stock: _gmailStock, ...safeSettings } = settings;
  const fallbackFee = normalizeFee(safeSettings["fee"]);
  safeSettings["fee"] = fallbackFee;
  safeSettings["payment_fees"] = canonicalPaymentFees(safeSettings["payment_fees"], fallbackFee);
  safeSettings["payment_mode"] = safeSettings["payment_mode"] === "dana_only" ? "dana_only" : "all";
  safeSettings["withdrawal_minimums"] = withdrawalMinimums(safeSettings["min_withdrawal"]);
  return safeSettings;
}

async function dailyDepositStats(settings: Record<string, unknown> | null) {
  const jakartaDate = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const start = encodeURIComponent(`${jakartaDate}T00:00:00+07:00`);
  const rows = await supabaseFetch<Record<string, unknown>[]>(
    `deposits?select=emails&created_at=gte.${start}&limit=500`,
  );
  const used = rows.reduce(
    (total, row) => total + (Array.isArray(row["emails"]) ? row["emails"].length : 0),
    0,
  );
  const limit = Math.max(0, Number(settings?.["daily_limit"] ?? 0));
  return { daily_used: used, daily_remaining: limit ? Math.max(0, limit - used) : null };
}

async function claimGmailStock(request: Request) {
  const user = await requireUser(request);
  const payload = await body(request);
  const count = Number(payload["count"] ?? 1);
  if (!Number.isSafeInteger(count) || count < 1 || count > 5)
    return json({ error: "Jumlah Gmail per batch harus 1-5 akun" }, { status: 400 });

  const settings = await getSettings();
  if (!settings?.["auto_stock_enabled"])
    return json({ error: "Generate Gmail sedang dimatikan admin" }, { status: 423 });

  const claimed = await supabaseFetch<{ gmail: string }[]>("rpc/claim_gmail_stock_batch", {
    method: "POST",
    body: JSON.stringify({ p_user_id: user["id"], p_count: count }),
  });
  const gmails = Array.isArray(claimed) ? claimed.map((item) => item.gmail).filter(Boolean) : [];
  if (!gmails.length) return json({ error: "Stok Gmail sedang kosong" }, { status: 409 });
  return json({ gmail: gmails[0], gmails, count: gmails.length });
}

async function generatedGmailList(request: Request) {
  const user = await requireUser(request);
  const userId = encodeURIComponent(String(user["id"]));
  const [claims, deposits] = await Promise.all([
    supabaseFetch<Record<string, unknown>[]>(
      `generated_gmail_claims?select=id,gmail,normalized_gmail,created_at&user_id=eq.${userId}&archived_at=is.null&order=created_at.desc&limit=1000`,
    ),
    supabaseFetch<Record<string, unknown>[]>(
      `deposits?select=id,emails,status,accepted_emails,rejected_emails,reason,created_at&user_id=eq.${userId}&order=created_at.desc&limit=1000`,
    ),
  ]);

  const statusByEmail = new Map<
    string,
    { status: string; deposit_id: string; reason: string | null }
  >();
  for (const deposit of deposits) {
    const emails = Array.isArray(deposit["emails"]) ? deposit["emails"].map(text) : [];
    const accepted = new Set(
      Array.isArray(deposit["accepted_emails"])
        ? deposit["accepted_emails"].map((email) => text(email).toLowerCase())
        : [],
    );
    const rejected = new Set(
      Array.isArray(deposit["rejected_emails"])
        ? deposit["rejected_emails"].map((email) => text(email).toLowerCase())
        : [],
    );
    for (const email of emails) {
      const normalized = email.toLowerCase();
      if (!normalized || statusByEmail.has(normalized)) continue;
      let status = "diproses";
      if (
        accepted.has(normalized) ||
        (deposit["status"] === "diterima" && !rejected.has(normalized))
      )
        status = "berhasil";
      else if (rejected.has(normalized) || deposit["status"] === "ditolak") status = "ditolak";
      statusByEmail.set(normalized, {
        status,
        deposit_id: String(deposit["id"]),
        reason: status === "ditolak" ? text(deposit["reason"]) || "Ditolak admin" : null,
      });
    }
  }

  return json({
    gmails: claims.map((claim) => {
      const status = statusByEmail.get(String(claim["normalized_gmail"]).toLowerCase());
      return {
        id: claim["id"],
        gmail: claim["gmail"],
        created_at: claim["created_at"],
        status: status?.status ?? "belum_disetor",
        reason: status?.reason ?? null,
        deposit_id: status?.deposit_id ?? null,
      };
    }),
  });
}

async function archiveGeneratedGmail(request: Request, id: string) {
  const user = await requireUser(request);
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return json({ error: "Gmail tidak ditemukan" }, { status: 404 });
  let result: { outcome?: string } | null;
  try {
    result = await supabaseFetch<{ outcome?: string } | null>("rpc/delete_generated_gmail", {
      method: "POST",
      body: JSON.stringify({ p_user_id: user["id"], p_id: id }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.startsWith("Supabase 404") && /delete_generated_gmail/i.test(detail))
      return json(
        { error: "Database belum memakai migration hapus Gmail. Terapkan migration terbaru." },
        { status: 503 },
      );
    throw error;
  }
  switch (result?.outcome) {
    case "returned":
      return json({ ok: true, outcome: "returned" });
    case "archived":
      return json({ ok: true, outcome: "archived" });
    case "processing":
      return json(
        { error: "Gmail sedang diproses admin, tidak bisa dihapus", outcome: "processing" },
        { status: 409 },
      );
    case "not_found":
      return json({ error: "Gmail tidak ditemukan" }, { status: 404 });
    default:
      return json({ error: "Gagal menghapus Gmail" }, { status: 503 });
  }
}

async function adminGeneratedGmailList(request: Request) {
  await requireAdmin(request);
  const rows = await supabaseFetch<Record<string, unknown>[]>(
    "generated_gmail_claims?select=id,gmail,normalized_gmail,user_id,created_at,archived_at,profiles(username,display_name)&order=created_at.desc&limit=5000",
  );
  return json({
    gmails: rows.map((row) => ({
      id: row["id"],
      gmail: row["gmail"],
      normalized_gmail: row["normalized_gmail"],
      user_id: row["user_id"],
      created_at: row["created_at"],
      archived_at: row["archived_at"],
      username:
        row["profiles"] && typeof row["profiles"] === "object"
          ? (row["profiles"] as Record<string, unknown>)["username"]
          : row["user_id"],
      display_name:
        row["profiles"] && typeof row["profiles"] === "object"
          ? (row["profiles"] as Record<string, unknown>)["display_name"]
          : "",
    })),
  });
}

async function updateWallet(request: Request) {
  const user = await requireUser(request);
  const payload = await body(request);
  const bank = text(payload["bank"]) || "DANA";
  const name = text(payload["name"]).slice(0, 100);
  const number = text(payload["number"]);
  const supportedBanks = new Set(["DANA", "OVO", "GoPay", "ShopeePay", "BCA", "BRI", "Mandiri"]);
  const settings = await getSettings();
  if (settings?.["payment_mode"] === "dana_only" && bank !== "DANA")
    return json(
      { error: "Admin saat ini hanya membuka payment DANA. Pilih DANA lalu isi ulang payment." },
      { status: 400 },
    );
  if (!supportedBanks.has(bank) || !name || !/^[0-9]{8,16}$/.test(number))
    return json({ error: "Nomor wallet 8-16 digit dan nama wajib diisi" }, { status: 400 });
  const updated = await supabaseFetch<Record<string, unknown>[]>(
    `profiles?id=eq.${encodeURIComponent(String(user["id"]))}&select=id,wallet_bank,wallet_name,wallet_number`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ wallet_bank: bank, wallet_name: name, wallet_number: number }),
    },
  );
  const saved =
    updated[0] ??
    (
      await supabaseFetch<Record<string, unknown>[]>(
        `profiles?id=eq.${encodeURIComponent(String(user["id"]))}&select=id,wallet_bank,wallet_name,wallet_number&limit=1`,
      )
    )[0];
  if (!saved || saved["wallet_number"] !== number || saved["wallet_name"] !== name)
    return json({ error: "Data rekening gagal disimpan, silakan coba lagi" }, { status: 409 });
  const freshUser = await getCurrentUser(request);
  return json({ ok: true, wallet: saved, user: freshUser ? publicUser(freshUser) : undefined });
}

async function userWithdrawals(request: Request, admin = false) {
  const user = admin ? await requireAdmin(request) : await requireUser(request);
  const query = admin
    ? "withdrawals?select=*,profiles(username,display_name)&order=created_at.desc&limit=500"
    : `withdrawals?select=*&user_id=eq.${encodeURIComponent(String(user["id"]))}&order=created_at.desc&limit=100`;
  return json({ withdrawals: await supabaseFetch<Record<string, unknown>[]>(query) });
}

async function createWithdrawal(request: Request) {
  const user = await requireUser(request);
  const settings = await getSettings();
  if (!settings?.["withdraw_open"])
    return json({ error: "Penarikan sedang ditutup oleh admin" }, { status: 423 });
  const payload = await body(request);
  const amount = Math.floor(Number(payload["amount"]));
  const balance = Number(user["balance"] ?? 0);
  const configuredBank = paymentMethods.includes(String(user["wallet_bank"]))
    ? String(user["wallet_bank"])
    : "DANA";
  if (settings["payment_mode"] === "dana_only" && configuredBank !== "DANA")
    return json(
      { error: "Admin saat ini hanya membuka payment DANA. Pilih DANA lalu isi ulang payment." },
      { status: 400 },
    );
  const bank = configuredBank;
  const paymentFees = canonicalPaymentFees(settings["payment_fees"], normalizeFee(settings["fee"]));
  const fee = paymentFees[bank] ?? 0;
  const minimum = withdrawalMinimums(settings["min_withdrawal"])[bank] ?? 0;
  if (!Number.isFinite(amount) || amount <= 0 || amount < minimum)
    return json(
      { error: `Minimal penarikan ${bank} Rp${minimum.toLocaleString("id-ID")}` },
      { status: 400 },
    );
  if (fee >= amount)
    return json({ error: "Fee harus lebih kecil daripada nominal penarikan" }, { status: 400 });
  if (amount > balance) return json({ error: "Saldo tidak cukup" }, { status: 400 });
  if (!user["wallet_number"] || !user["wallet_name"])
    return json({ error: "Isi data rekening terlebih dahulu" }, { status: 400 });
  if (payload["confirmWallet"] !== true)
    return json({ error: "Konfirmasi nomor payment terlebih dahulu" }, { status: 400 });
  const updatedProfiles = await supabaseFetch<Record<string, unknown>[]>(
    `profiles?id=eq.${encodeURIComponent(String(user["id"]))}&balance=eq.${encodeURIComponent(String(balance))}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ balance: balance - amount }),
    },
  );
  if (!updatedProfiles.length)
    return json({ error: "Saldo berubah, silakan muat ulang lalu coba lagi" }, { status: 409 });
  const restoreBalance = () =>
    supabaseFetch(
      `profiles?id=eq.${encodeURIComponent(String(user["id"]))}&balance=eq.${encodeURIComponent(String(balance - amount))}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ balance }),
      },
    ).catch(() => undefined);
  let rows: Record<string, unknown>[];
  try {
    rows = await supabaseFetch<Record<string, unknown>[]>("withdrawals", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: user["id"],
        amount,
        fee,
        fee_deducted_from_amount: true,
        wallet_bank: bank,
        wallet_name: user["wallet_name"],
        wallet_number: user["wallet_number"],
        status: "pending",
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("PGRST204") && !message.includes("400")) {
      await restoreBalance();
      throw error;
    }
    try {
      // Compatibility fallback for deployments whose PostgREST schema cache does
      // not yet know the optional wallet_bank column. Required wallet fields must
      // remain in the payload because the original schema marks them NOT NULL.
      rows = await supabaseFetch<Record<string, unknown>[]>("withdrawals", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          user_id: user["id"],
          amount,
          fee,
          fee_deducted_from_amount: true,
          wallet_name: user["wallet_name"],
          wallet_number: user["wallet_number"],
          status: "pending",
        }),
      });
    } catch (fallbackError) {
      await restoreBalance();
      throw fallbackError;
    }
  }
  const freshUser = await getCurrentUser(request);
  return json(
    { withdrawal: rows[0], user: freshUser ? publicUser(freshUser) : undefined },
    { status: 201 },
  );
}

async function processWithdrawal(request: Request, id: string, status: "selesai" | "ditolak") {
  await requireAdmin(request);
  const payload = await body(request);
  const rows = await supabaseFetch<Record<string, unknown>[]>(
    `withdrawals?select=*&id=eq.${encodeURIComponent(id)}&status=eq.pending&limit=1`,
  );
  const withdrawal = rows[0];
  if (!withdrawal)
    return json({ error: "Penarikan tidak ditemukan atau sudah diproses" }, { status: 409 });
  await supabaseFetch(`withdrawals?id=eq.${encodeURIComponent(id)}&status=eq.pending`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status,
      reason: status === "ditolak" ? text(payload["reason"]) || "Ditolak admin" : null,
      completed_at: new Date().toISOString(),
    }),
  });
  const userRows = await supabaseFetch<Record<string, unknown>[]>(
    `profiles?select=${status === "selesai" ? "withdrawn" : "balance"}&id=eq.${encodeURIComponent(String(withdrawal["user_id"]))}&limit=1`,
  );
  const field = status === "selesai" ? "withdrawn" : "balance";
  const delta =
    status === "selesai"
      ? Number(withdrawal["amount"] ?? 0)
      : Number(withdrawal["amount"] ?? 0) +
        (withdrawal["fee_deducted_from_amount"] === true ? 0 : Number(withdrawal["fee"] ?? 0));
  await supabaseFetch(`profiles?id=eq.${encodeURIComponent(String(withdrawal["user_id"]))}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ [field]: Number(userRows[0]?.[field] ?? 0) + delta }),
  });
  return json({ ok: true });
}

async function setUserBlocked(request: Request, id: string, blocked: boolean) {
  await requireAdmin(request);
  await supabaseFetch(`profiles?id=eq.${encodeURIComponent(id)}&role=eq.user`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ is_blocked: blocked }),
  });
  if (blocked)
    await supabaseFetch(`sessions?profile_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  return json({ ok: true, blocked });
}

async function deleteUser(request: Request, id: string) {
  await requireAdmin(request);
  await supabaseFetch(`sessions?profile_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  await supabaseFetch(`deposits?user_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  await supabaseFetch(`withdrawals?user_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  await supabaseFetch(`profiles?id=eq.${encodeURIComponent(id)}&role=eq.user`, {
    method: "DELETE",
  });
  return json({ ok: true });
}

async function logout() {
  return json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
}

async function handler(request: Request, path: string) {
  const limits: Record<string, [number, number]> = {
    "auth/login": [8, 15 * 60 * 1000],
    "auth/register": [5, 60 * 60 * 1000],
    "auth/resend-registration": [3, 15 * 60 * 1000],
    "auth/verify-registration": [10, 15 * 60 * 1000],
    "auth/change-password": [5, 15 * 60 * 1000],
    deposits: [20, 60 * 1000],
    withdrawals: [5, 10 * 60 * 1000],
    wallet: [10, 10 * 60 * 1000],
    leaderboard: [30, 60 * 1000],
    "stock/claim": [10, 60 * 1000],
    "admin/settings": [30, 60 * 1000],
  };
  const limit = limits[path];
  if (limit) {
    const blocked = rateLimit(request, path, limit[0], limit[1]);
    if (blocked) return blocked;
  }
  if (request.method === "POST" && path === "auth/login") return login(request);
  if (request.method === "POST" && path === "auth/register") return register(request);
  if (request.method === "POST" && path === "auth/resend-registration")
    return resendRegistrationOtp(request);
  if (request.method === "POST" && path === "auth/change-password")
    return changeOwnPassword(request);
  if (request.method === "POST" && path === "auth/verify-registration")
    return verifyRegistrationOtp(request);
  if (request.method === "POST" && path === "auth/logout") return logout();
  if (request.method === "GET" && path === "auth/me") {
    const user = await getCurrentUser(request);
    return json({ user: user ? publicUser(user) : null });
  }
  if (request.method === "GET" && path === "settings") {
    const user = await requireUser(request);
    const settings = await getSettings();
    const safe = user["role"] === "admin" ? settings : userSettings(settings);
    return json({ settings: { ...(safe || {}), ...(await dailyDepositStats(settings)) } });
  }
  if (request.method === "GET" && path === "deposits") return userDeposits(request);
  if (request.method === "GET" && path === "leaderboard") return leaderboard(request);
  if (request.method === "PATCH" && path === "profile/avatar") return updateProfileAvatar(request);
  if (request.method === "GET" && path.startsWith("deposits/") && path.split("/").length === 2)
    return userDepositDetail(request, path.split("/")[1] ?? "");
  if (request.method === "POST" && path === "deposits") return createDeposit(request);
  if (request.method === "GET" && path === "admin/deposits") return userDeposits(request, true);
  if (request.method === "GET" && path === "admin/users") return adminUsers(request);
  if (request.method === "POST" && path.startsWith("admin/deposits/") && path.endsWith("/approve"))
    return approveDeposit(request, path.split("/")[2] ?? "");
  if (request.method === "POST" && path.startsWith("admin/deposits/") && path.endsWith("/reject"))
    return rejectDeposit(request, path.split("/")[2] ?? "");
  if (request.method === "POST" && path.startsWith("admin/users/") && path.endsWith("/block"))
    return setUserBlocked(request, path.split("/")[2] ?? "", true);
  if (request.method === "POST" && path.startsWith("admin/users/") && path.endsWith("/unblock"))
    return setUserBlocked(request, path.split("/")[2] ?? "", false);
  if (request.method === "POST" && path.startsWith("admin/users/") && path.endsWith("/password"))
    return resetUserPassword(request, path.split("/")[2] ?? "");
  if (request.method === "POST" && path.startsWith("admin/users/") && path.endsWith("/balance"))
    return adjustUserBalance(request, path.split("/")[2] ?? "");
  if (request.method === "POST" && path.startsWith("admin/users/") && path.endsWith("/delete"))
    return deleteUser(request, path.split("/")[2] ?? "");
  if (request.method === "PATCH" && path === "admin/settings") return updateSettings(request);
  if (request.method === "POST" && path === "stock/claim") return claimGmailStock(request);
  if (request.method === "GET" && path === "stock/generated") return generatedGmailList(request);
  if (request.method === "GET" && path === "admin/stock/assigned")
    return adminGeneratedGmailList(request);
  if (request.method === "DELETE" && path.startsWith("stock/generated/"))
    return archiveGeneratedGmail(request, path.split("/")[2] ?? "");
  if (request.method === "PATCH" && path === "wallet") return updateWallet(request);
  if (request.method === "GET" && path === "withdrawals") return userWithdrawals(request);
  if (request.method === "POST" && path === "withdrawals") return createWithdrawal(request);
  if (request.method === "GET" && path === "admin/withdrawals")
    return userWithdrawals(request, true);
  if (
    request.method === "POST" &&
    path.startsWith("admin/withdrawals/") &&
    path.endsWith("/approve")
  )
    return processWithdrawal(request, path.split("/")[2] ?? "", "selesai");
  if (
    request.method === "POST" &&
    path.startsWith("admin/withdrawals/") &&
    path.endsWith("/reject")
  )
    return processWithdrawal(request, path.split("/")[2] ?? "", "ditolak");
  return json({ error: "API route tidak ditemukan" }, { status: 404 });
}

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await handler(
            request,
            new URL(request.url).pathname.replace(/^\/api\/?/, "").replace(/\/$/, ""),
          );
        } catch (error) {
          return error instanceof Response ? error : errorResponse(error);
        }
      },
      POST: async ({ request }) => {
        try {
          return await handler(
            request,
            new URL(request.url).pathname.replace(/^\/api\/?/, "").replace(/\/$/, ""),
          );
        } catch (error) {
          return error instanceof Response ? error : errorResponse(error);
        }
      },
      PATCH: async ({ request }) => {
        try {
          return await handler(
            request,
            new URL(request.url).pathname.replace(/^\/api\/?/, "").replace(/\/$/, ""),
          );
        } catch (error) {
          return error instanceof Response ? error : errorResponse(error);
        }
      },
      DELETE: async ({ request }) => {
        try {
          return await handler(
            request,
            new URL(request.url).pathname.replace(/^\/api\/?/, "").replace(/\/$/, ""),
          );
        } catch (error) {
          return error instanceof Response ? error : errorResponse(error);
        }
      },
    },
  },
});
