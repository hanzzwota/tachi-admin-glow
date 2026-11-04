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
  const legacyWhatsApp = Array.isArray(source.whatsapp) ? source.whatsapp : [];
  const legacyTelegram = Array.isArray(source.telegram) ? source.telegram : [];
  const rawAdmins = Array.isArray(source.admins) ? source.admins : [];
  const admins = [0, 1].map((index) => {
    const item =
      rawAdmins[index] && typeof rawAdmins[index] === "object"
        ? (rawAdmins[index] as Record<string, unknown>)
        : {};
    return {
      name: text(item.name) || `Admin ${index + 1}`,
      whatsapp: text(item.whatsapp) || text(legacyWhatsApp[index]),
      telegram: text(item.telegram) || text(legacyTelegram[index]),
      enabled: item.enabled !== false,
    };
  });
  return {
    whatsappEnabled: source.whatsappEnabled !== false && source.whatsapp_enabled !== false,
    telegramEnabled: source.telegramEnabled !== false && source.telegram_enabled !== false,
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
  const username = text(payload.username);
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username) || password.length < 6)
    return json({ error: "Username atau password tidak valid" }, { status: 400 });

  const adminUsername = process.env.ADMIN_USERNAME ?? "";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "";
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
    } else if (user.role !== "admin") {
      return json(
        { error: "Username admin sudah dipakai akun user. Gunakan username admin khusus." },
        { status: 409 },
      );
    }
  } else {
    if (
      !user ||
      !(await verifyPassword(password, String(user.password_hash), String(user.password_salt)))
    )
      return json({ error: "Username atau password salah" }, { status: 401 });
  }
  if (!user) return json({ error: "Username atau password salah" }, { status: 401 });
  if (user.is_blocked === true) return json({ error: "Akun ini diblokir admin" }, { status: 403 });
  const session = await createSession(String(user.id));
  return json({ user: publicUser(user) }, { headers: { "set-cookie": session.cookie } });
}

async function register(request: Request) {
  const payload = await body(request);
  const username = text(payload.username);
  const displayName = text(payload.displayName) || text(payload.name);
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username))
    return json(
      { error: "Username 3-30 karakter, hanya huruf, angka, titik, dan underscore" },
      { status: 400 },
    );
  if (password.length < 6) return json({ error: "Password minimal 6 karakter" }, { status: 400 });
  if (process.env.ADMIN_USERNAME && username === process.env.ADMIN_USERNAME)
    return json({ error: "Username tersebut dicadangkan untuk admin" }, { status: 409 });
  const existing = await supabaseFetch<Record<string, unknown>[]>(
    `profiles?select=id&username=eq.${encodeURIComponent(username)}&limit=1`,
  );
  if (existing.length) return json({ error: "Username sudah dipakai" }, { status: 409 });
  const hashed = await hashPassword(password);
  const created = await supabaseFetch<Record<string, unknown>[]>("profiles", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      username,
      display_name: displayName.slice(0, 100),
      password_hash: hashed.hash,
      password_salt: hashed.salt,
    }),
  });
  const user =
    created?.[0] ??
    (
      await supabaseFetch<Record<string, unknown>[]>(
        `profiles?select=*&username=eq.${encodeURIComponent(username)}&limit=1`,
      )
    )[0];
  if (!user) return json({ error: "Akun gagal dibuat, silakan coba lagi" }, { status: 500 });
  const session = await createSession(String(user.id));
  return json(
    { user: publicUser(user) },
    { status: 201, headers: { "set-cookie": session.cookie } },
  );
}

function publicUser(user: Record<string, unknown>) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    balance: Number(user.balance ?? 0),
    withdrawn: Number(user.withdrawn ?? 0),
    wallet: {
      bank: text(user.wallet_bank) || "DANA",
      name: text(user.wallet_name),
      number: text(user.wallet_number),
    },
  };
}

async function userDeposits(request: Request, admin = false) {
  const user = admin ? await requireAdmin(request) : await requireUser(request);
  const query = admin
    ? "deposits?select=*,profiles!deposits_user_id_fkey(username,display_name)&order=created_at.desc&limit=500"
    : `deposits?select=*&user_id=eq.${encodeURIComponent(String(user.id))}&order=created_at.desc&limit=100`;
  const rows = await supabaseFetch<Record<string, unknown>[]>(query);
  return json({ deposits: rows });
}

async function userDepositDetail(request: Request, id: string) {
  const user = await requireUser(request);
  const userFilter = `user_id=eq.${encodeURIComponent(String(user.id))}&limit=1`;
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
      campaign_password: settings?.campaign_password ?? "",
      pw_text: settings?.pw_text ?? "PW",
      pw_enabled: settings?.pw_enabled !== false,
    },
  });
}

async function adminUsers(request: Request) {
  await requireAdmin(request);
  const users = await supabaseFetch<Record<string, unknown>[]>(
    "profiles?select=id,username,display_name,role,balance,withdrawn,wallet_bank,wallet_name,wallet_number,is_blocked&role=eq.user&order=created_at.desc&limit=500",
  );
  return json({ users });
}

async function createDeposit(request: Request) {
  const user = await requireUser(request);
  const payload = await body(request);
  const requestedRoute = text(payload.jalur).trim().toUpperCase();
  if (requestedRoute !== "PW" && requestedRoute !== "CAPTCHA")
    return json({ error: "Jalur setoran tidak valid" }, { status: 400 });
  const emails = Array.isArray(payload.emails) ? payload.emails.map(text).filter(Boolean) : [];
  if (!emails.length || emails.some((email) => !/^[a-z0-9._%+-]{1,64}@gmail\.com$/i.test(email)))
    return json({ error: "Daftar Gmail tidak valid" }, { status: 400 });
  const seenEmails = new Set<string>();
  const duplicatesInRequest = new Set<string>();
  emails.forEach((email) => {
    const normalized = email.toLowerCase();
    if (seenEmails.has(normalized)) duplicatesInRequest.add(normalized);
    seenEmails.add(normalized);
  });
  if (duplicatesInRequest.size)
    return json(
      {
        error: `Gmail yang sama tidak boleh dikirim lebih dari satu kali: ${[...duplicatesInRequest].slice(0, 5).join(", ")}`,
      },
      { status: 409 },
    );
  const settings = await getSettings();
  if (!settings?.store_open)
    return json(
      {
        error: text(settings?.store_closed_reason)
          ? `Setoran ditutup oleh admin. Alasan: ${text(settings.store_closed_reason)}`
          : "Setoran sedang ditutup oleh admin",
      },
      { status: 423 },
    );
  const jalur = requestedRoute;
  if (jalur === "PW" && settings.pw_enabled === false)
    return json({ error: "Jalur PW sedang dinonaktifkan admin" }, { status: 423 });
  if (jalur === "CAPTCHA" && settings.captcha_enabled !== true)
    return json({ error: "Jalur CAPTCHA sedang dinonaktifkan admin" }, { status: 423 });
  if (jalur === "PW" && text(payload.campaignPassword) !== String(settings.campaign_password))
    return json({ error: "Password wajib salah" }, { status: 403 });
  const rate = Number(jalur === "PW" ? settings["pw_rate"] : settings["captcha_rate"]);
  if (!Number.isSafeInteger(rate) || rate < 0)
    return json({ error: "Konfigurasi harga jalur belum valid" }, { status: 503 });
  if (emails.length > Number(settings.batch_limit))
    return json({ error: `Maksimal ${settings.batch_limit} Gmail per transaksi` }, { status: 400 });
  if (settings.auto_stock_enabled === true) {
    const generatedClaims = await supabaseFetch<Record<string, unknown>[]>(
      `generated_gmail_claims?select=gmail,normalized_gmail&user_id=eq.${encodeURIComponent(String(user.id))}&archived_at=is.null&limit=1000`,
    );
    const generatedSet = new Set(
      generatedClaims
        .map((claim) => text(claim.normalized_gmail || claim.gmail).toLowerCase())
        .filter(Boolean),
    );
    const notGenerated = emails.filter((email) => !generatedSet.has(email.toLowerCase()));
    if (notGenerated.length) {
      const shown = notGenerated.slice(0, 5).join(", ");
      const remaining = notGenerated.length > 5 ? `, dan ${notGenerated.length - 5} lainnya` : "";
      return json(
        {
          warning: true,
          rejected: true,
          error: `Setoran tidak dikirim dan tidak masuk Riwayat. Gmail wajib sesuai daftar Generated Gmail pada UI. Gmail tidak sesuai: ${shown}${remaining}`,
        },
        { status: 422 },
      );
    }
  }
  const duplicateRows = await supabaseFetch<Record<string, unknown>[]>(
    "rpc/find_duplicate_deposit_gmails",
    {
      method: "POST",
      body: JSON.stringify({ p_emails: emails }),
    },
  );
  if (duplicateRows.length) {
    const duplicateEmails = duplicateRows.map((item) => text(item.email)).filter(Boolean);
    const shown = duplicateEmails.slice(0, 5).join(", ");
    const remaining =
      duplicateEmails.length > 5 ? `, dan ${duplicateEmails.length - 5} lainnya` : "";
    return json(
      {
        error: `Gmail sudah pernah dikirim dan tidak dapat dikirim ulang: ${shown}${remaining}`,
      },
      { status: 409 },
    );
  }
  const jakartaDate = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dayStart = encodeURIComponent(`${jakartaDate}T00:00:00+07:00`);
  const today = await supabaseFetch<Record<string, unknown>[]>(
    `deposits?select=emails&created_at=gte.${dayStart}&limit=500`,
  );
  const submittedToday = today.reduce(
    (total, row) => total + (Array.isArray(row.emails) ? row.emails.length : 0),
    0,
  );
  const dailyLimit = Number(settings.daily_limit ?? 0);
  if (dailyLimit > 0 && submittedToday + emails.length > dailyLimit)
    return json(
      { error: `Batas setor hari ini tersisa ${Math.max(0, dailyLimit - submittedToday)} Gmail` },
      { status: 429 },
    );
  const rows = await supabaseFetch<Record<string, unknown>[]>("deposits", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: user.id,
      transaction_number: `TRX-${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      emails,
      status: "pending",
      jalur,
      rate,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
  return json({ deposit: rows[0] }, { status: 201 });
}

async function approveDeposit(request: Request, id: string) {
  const admin = await requireAdmin(request);
  const payload = await body(request);
  const acceptedEmails = Array.isArray(payload.acceptedEmails)
    ? payload.acceptedEmails.map(text).filter(Boolean)
    : null;
  const result = await supabaseFetch<{ ok: boolean; earned: number; error_code: string | null }[]>(
    "rpc/approve_deposit_atomic",
    {
      method: "POST",
      body: JSON.stringify({
        p_deposit_id: id,
        p_admin_id: admin.id,
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
  const reason = text(payload.reason);
  if (!reason) return json({ error: "Alasan penolakan wajib diisi" }, { status: 400 });
  const rejectedEmails = Array.isArray(payload.rejectedEmails)
    ? payload.rejectedEmails.map(text).filter(Boolean)
    : null;
  const result = await supabaseFetch<{ ok: boolean; error_code: string | null }[]>(
    "rpc/reject_deposit_atomic",
    {
      method: "POST",
      body: JSON.stringify({
        p_deposit_id: id,
        p_admin_id: admin.id,
        p_reason: reason,
        p_rejected_emails: rejectedEmails,
      }),
    },
  );
  if (!result[0]?.ok)
    return json({ error: "Setoran tidak ditemukan atau sudah diproses" }, { status: 409 });
  return json({ ok: true });
}

async function updateSettings(request: Request) {
  await requireAdmin(request);
  const payload = await body(request);
  const current = await getSettings();
  const stock = Array.isArray(payload.gmailStock) ? payload.gmailStock : [];
  const numberOrZero = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const incomingFee = payload.fee ?? current?.fee ?? 0;
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
  const incomingPaymentFees = payload.paymentFees ?? current?.payment_fees ?? {};
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
      numberOrZero(payload.minWithdrawal ?? current?.min_withdrawal),
    ),
    fee: normalizeFee(payload.fee ?? current?.fee),
    payment_fees: canonicalPaymentFees(
      payload.paymentFees ?? current?.payment_fees,
      normalizeFee(payload.fee ?? current?.fee),
    ),
    campaign_password: text(payload.campaignPassword ?? current?.campaign_password),
    pw_text: text(payload.pwText ?? current?.pw_text) || "PW",
    pw_enabled: booleanValue(payload.pwEnabled, current?.pw_enabled !== false),
    captcha_enabled: booleanValue(payload.captchaEnabled, current?.captcha_enabled === true),
    captcha_text: text(payload.captchaText ?? current?.captcha_text) || "CAPTCHA",
    store_open: booleanValue(payload.storeOpen, current?.store_open !== false),
    withdraw_open: booleanValue(payload.withdrawOpen, current?.withdraw_open !== false),
    checker_open: booleanValue(payload.checkerOpen, current?.checker_open !== false),
    daily_limit: numberOrZero(payload.dailyLimit ?? current?.daily_limit),
    batch_limit: numberOrZero(payload.batchLimit ?? current?.batch_limit),
    announcement: text(payload.announcement ?? current?.announcement),
    rules_text: text(payload.rulesText ?? current?.rules_text),
    payment_mode: paymentModes.includes(payload.paymentMode as (typeof paymentModes)[number])
      ? payload.paymentMode
      : current?.payment_mode === "dana_only"
        ? "dana_only"
        : "all",
    support_channels: canonicalSupportChannels(
      payload.supportChannels ?? current?.support_channels,
    ),
    auto_stock_enabled: booleanValue(
      payload.autoStockEnabled,
      current?.auto_stock_enabled === true,
    ),
    gmail_stock: Array.isArray(payload.gmailStock)
      ? stock
      : Array.isArray(current?.gmail_stock)
        ? current.gmail_stock
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
    rules_text: rulesText,
    support_channels: supportChannels,
    payment_mode: paymentMode,
    ...coreSettings
  } = allowed;
  await patchSettings(coreSettings);
  for (const optionalSetting of [
    ["payment_fees", paymentFees],
    ["rules_text", rulesText],
    ["support_channels", supportChannels],
    ["payment_mode", paymentMode],
    [
      "store_closed_reason",
      text(payload.storeClosedReason ?? current?.store_closed_reason).slice(0, 300),
    ],
  ] as const) {
    try {
      await patchSettings({ [optionalSetting[0]]: optionalSetting[1] });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const optionalColumnMissing =
        message.includes("PGRST204") ||
        (message.includes("400") && message.includes(optionalSetting[0]));
      if (
        !optionalColumnMissing ||
        (optionalSetting[0] === "store_closed_reason" && optionalSetting[1])
      )
        throw error;
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
  const fallbackFee = normalizeFee(safeSettings.fee);
  safeSettings.fee = fallbackFee;
  safeSettings.payment_fees = canonicalPaymentFees(safeSettings.payment_fees, fallbackFee);
  safeSettings.payment_mode = safeSettings.payment_mode === "dana_only" ? "dana_only" : "all";
  safeSettings.withdrawal_minimums = withdrawalMinimums(safeSettings.min_withdrawal);
  return safeSettings;
}

async function dailyDepositStats(settings: Record<string, unknown> | null) {
  const jakartaDate = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const start = encodeURIComponent(`${jakartaDate}T00:00:00+07:00`);
  const rows = await supabaseFetch<Record<string, unknown>[]>(
    `deposits?select=emails&created_at=gte.${start}&limit=500`,
  );
  const used = rows.reduce(
    (total, row) => total + (Array.isArray(row.emails) ? row.emails.length : 0),
    0,
  );
  const limit = Math.max(0, Number(settings?.daily_limit ?? 0));
  return { daily_used: used, daily_remaining: limit ? Math.max(0, limit - used) : null };
}

async function claimGmailStock(request: Request) {
  const user = await requireUser(request);
  const payload = await body(request);
  const count = Number(payload.count ?? 1);
  if (!Number.isSafeInteger(count) || count < 1 || count > 5)
    return json({ error: "Jumlah Gmail per batch harus 1-5 akun" }, { status: 400 });

  const settings = await getSettings();
  if (!settings?.auto_stock_enabled)
    return json({ error: "Generate Gmail sedang dimatikan admin" }, { status: 423 });

  const claimed = await supabaseFetch<{ gmail: string }[]>("rpc/claim_gmail_stock_batch", {
    method: "POST",
    body: JSON.stringify({ p_user_id: user.id, p_count: count }),
  });
  const gmails = Array.isArray(claimed) ? claimed.map((item) => item.gmail).filter(Boolean) : [];
  if (!gmails.length) return json({ error: "Stok Gmail sedang kosong" }, { status: 409 });
  return json({ gmail: gmails[0], gmails, count: gmails.length });
}

async function generatedGmailList(request: Request) {
  const user = await requireUser(request);
  const userId = encodeURIComponent(String(user.id));
  const [claims, deposits] = await Promise.all([
    supabaseFetch<Record<string, unknown>[]>(
      `generated_gmail_claims?select=id,gmail,normalized_gmail,created_at&user_id=eq.${userId}&archived_at=is.null&order=created_at.desc&limit=1000`,
    ),
    supabaseFetch<Record<string, unknown>[]>(
      `deposits?select=id,emails,status,accepted_emails,rejected_emails,created_at&user_id=eq.${userId}&order=created_at.desc&limit=1000`,
    ),
  ]);

  const statusByEmail = new Map<string, { status: string; deposit_id: string }>();
  for (const deposit of deposits) {
    const emails = Array.isArray(deposit.emails) ? deposit.emails.map(text) : [];
    const accepted = new Set(
      Array.isArray(deposit.accepted_emails)
        ? deposit.accepted_emails.map((email) => text(email).toLowerCase())
        : [],
    );
    const rejected = new Set(
      Array.isArray(deposit.rejected_emails)
        ? deposit.rejected_emails.map((email) => text(email).toLowerCase())
        : [],
    );
    for (const email of emails) {
      const normalized = email.toLowerCase();
      if (!normalized || statusByEmail.has(normalized)) continue;
      let status = "diproses";
      if (accepted.has(normalized) || (deposit.status === "diterima" && !rejected.has(normalized)))
        status = "berhasil";
      else if (rejected.has(normalized) || deposit.status === "ditolak") status = "ditolak";
      statusByEmail.set(normalized, { status, deposit_id: String(deposit.id) });
    }
  }

  return json({
    gmails: claims.map((claim) => {
      const status = statusByEmail.get(String(claim.normalized_gmail).toLowerCase());
      return {
        id: claim.id,
        gmail: claim.gmail,
        created_at: claim.created_at,
        status: status?.status ?? "belum_disetor",
        deposit_id: status?.deposit_id ?? null,
      };
    }),
  });
}

async function archiveGeneratedGmail(request: Request, id: string) {
  const user = await requireUser(request);
  const filter = `id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(String(user.id))}&archived_at=is.null`;
  const rows = await supabaseFetch<Record<string, unknown>[]>(
    `generated_gmail_claims?select=id&${filter}&limit=1`,
  );
  if (!rows.length) return json({ error: "Gmail tidak ditemukan" }, { status: 404 });
  await supabaseFetch(`generated_gmail_claims?${filter}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ archived_at: new Date().toISOString() }),
  });
  return json({ ok: true });
}

async function adminGeneratedGmailList(request: Request) {
  await requireAdmin(request);
  const rows = await supabaseFetch<Record<string, unknown>[]>(
    "generated_gmail_claims?select=id,gmail,normalized_gmail,user_id,created_at,archived_at,profiles(username,display_name)&order=created_at.desc&limit=5000",
  );
  return json({
    gmails: rows.map((row) => ({
      id: row.id,
      gmail: row.gmail,
      normalized_gmail: row.normalized_gmail,
      user_id: row.user_id,
      created_at: row.created_at,
      archived_at: row.archived_at,
      username:
        row.profiles && typeof row.profiles === "object"
          ? (row.profiles as Record<string, unknown>).username
          : row.user_id,
      display_name:
        row.profiles && typeof row.profiles === "object"
          ? (row.profiles as Record<string, unknown>).display_name
          : "",
    })),
  });
}

async function updateWallet(request: Request) {
  const user = await requireUser(request);
  const payload = await body(request);
  const bank = text(payload.bank) || "DANA";
  const name = text(payload.name).slice(0, 100);
  const number = text(payload.number);
  const supportedBanks = new Set(["DANA", "OVO", "GoPay", "ShopeePay", "BCA", "BRI", "Mandiri"]);
  const settings = await getSettings();
  if (settings?.payment_mode === "dana_only" && bank !== "DANA")
    return json(
      { error: "Admin saat ini hanya membuka payment DANA. Pilih DANA lalu isi ulang payment." },
      { status: 400 },
    );
  if (!supportedBanks.has(bank) || !name || !/^[0-9]{8,16}$/.test(number))
    return json({ error: "Nomor wallet 8-16 digit dan nama wajib diisi" }, { status: 400 });
  const updated = await supabaseFetch<Record<string, unknown>[]>(
    `profiles?id=eq.${encodeURIComponent(String(user.id))}&select=id,wallet_bank,wallet_name,wallet_number`,
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
        `profiles?id=eq.${encodeURIComponent(String(user.id))}&select=id,wallet_bank,wallet_name,wallet_number&limit=1`,
      )
    )[0];
  if (!saved || saved.wallet_number !== number || saved.wallet_name !== name)
    return json({ error: "Data rekening gagal disimpan, silakan coba lagi" }, { status: 409 });
  const freshUser = await getCurrentUser(request);
  return json({ ok: true, wallet: saved, user: freshUser ? publicUser(freshUser) : undefined });
}

async function userWithdrawals(request: Request, admin = false) {
  const user = admin ? await requireAdmin(request) : await requireUser(request);
  const query = admin
    ? "withdrawals?select=*,profiles(username,display_name)&order=created_at.desc&limit=500"
    : `withdrawals?select=*&user_id=eq.${encodeURIComponent(String(user.id))}&order=created_at.desc&limit=100`;
  return json({ withdrawals: await supabaseFetch<Record<string, unknown>[]>(query) });
}

async function createWithdrawal(request: Request) {
  const user = await requireUser(request);
  const settings = await getSettings();
  if (!settings?.withdraw_open)
    return json({ error: "Penarikan sedang ditutup oleh admin" }, { status: 423 });
  const payload = await body(request);
  const amount = Math.floor(Number(payload.amount));
  const balance = Number(user.balance ?? 0);
  const configuredBank = paymentMethods.includes(String(user.wallet_bank))
    ? String(user.wallet_bank)
    : "DANA";
  if (settings.payment_mode === "dana_only" && configuredBank !== "DANA")
    return json(
      { error: "Admin saat ini hanya membuka payment DANA. Pilih DANA lalu isi ulang payment." },
      { status: 400 },
    );
  const bank = configuredBank;
  const paymentFees = canonicalPaymentFees(settings.payment_fees, normalizeFee(settings.fee));
  const fee = paymentFees[bank] ?? 0;
  const minimum = withdrawalMinimums(settings.min_withdrawal)[bank] ?? 0;
  if (!Number.isFinite(amount) || amount <= 0 || amount < minimum)
    return json(
      { error: `Minimal penarikan ${bank} Rp${minimum.toLocaleString("id-ID")}` },
      { status: 400 },
    );
  if (fee >= amount)
    return json({ error: "Fee harus lebih kecil daripada nominal penarikan" }, { status: 400 });
  if (amount > balance) return json({ error: "Saldo tidak cukup" }, { status: 400 });
  if (!user.wallet_number || !user.wallet_name)
    return json({ error: "Isi data rekening terlebih dahulu" }, { status: 400 });
  if (payload.confirmWallet !== true)
    return json({ error: "Konfirmasi nomor payment terlebih dahulu" }, { status: 400 });
  const updatedProfiles = await supabaseFetch<Record<string, unknown>[]>(
    `profiles?id=eq.${encodeURIComponent(String(user.id))}&balance=eq.${encodeURIComponent(String(balance))}`,
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
      `profiles?id=eq.${encodeURIComponent(String(user.id))}&balance=eq.${encodeURIComponent(String(balance - amount))}`,
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
        user_id: user.id,
        amount,
        fee,
        fee_deducted_from_amount: true,
        wallet_bank: bank,
        wallet_name: user.wallet_name,
        wallet_number: user.wallet_number,
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
          user_id: user.id,
          amount,
          fee,
          fee_deducted_from_amount: true,
          wallet_name: user.wallet_name,
          wallet_number: user.wallet_number,
          status: "pending",
        }),
      });
    } catch (fallbackError) {
      await restoreBalance();
      throw fallbackError;
    }
  }
  return json({ withdrawal: rows[0] }, { status: 201 });
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
      reason: status === "ditolak" ? text(payload.reason) || "Ditolak admin" : null,
      completed_at: new Date().toISOString(),
    }),
  });
  const userRows = await supabaseFetch<Record<string, unknown>[]>(
    `profiles?select=${status === "selesai" ? "withdrawn" : "balance"}&id=eq.${encodeURIComponent(String(withdrawal.user_id))}&limit=1`,
  );
  const field = status === "selesai" ? "withdrawn" : "balance";
  const delta =
    status === "selesai"
      ? Number(withdrawal.amount ?? 0)
      : Number(withdrawal.amount ?? 0) +
        (withdrawal.fee_deducted_from_amount === true ? 0 : Number(withdrawal.fee ?? 0));
  await supabaseFetch(`profiles?id=eq.${encodeURIComponent(String(withdrawal.user_id))}`, {
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
    deposits: [20, 60 * 1000],
    withdrawals: [5, 10 * 60 * 1000],
    wallet: [10, 10 * 60 * 1000],
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
  if (request.method === "POST" && path === "auth/logout") return logout();
  if (request.method === "GET" && path === "auth/me") {
    const user = await getCurrentUser(request);
    return json({ user: user ? publicUser(user) : null });
  }
  if (request.method === "GET" && path === "settings") {
    const user = await requireUser(request);
    const settings = await getSettings();
    const safe = user.role === "admin" ? settings : userSettings(settings);
    return json({ settings: { ...(safe || {}), ...(await dailyDepositStats(settings)) } });
  }
  if (request.method === "GET" && path === "deposits") return userDeposits(request);
  if (request.method === "GET" && path.startsWith("deposits/") && path.split("/").length === 2)
    return userDepositDetail(request, path.split("/")[1]);
  if (request.method === "POST" && path === "deposits") return createDeposit(request);
  if (request.method === "GET" && path === "admin/deposits") return userDeposits(request, true);
  if (request.method === "GET" && path === "admin/users") return adminUsers(request);
  if (request.method === "POST" && path.startsWith("admin/deposits/") && path.endsWith("/approve"))
    return approveDeposit(request, path.split("/")[2]);
  if (request.method === "POST" && path.startsWith("admin/deposits/") && path.endsWith("/reject"))
    return rejectDeposit(request, path.split("/")[2]);
  if (request.method === "POST" && path.startsWith("admin/users/") && path.endsWith("/block"))
    return setUserBlocked(request, path.split("/")[2], true);
  if (request.method === "POST" && path.startsWith("admin/users/") && path.endsWith("/unblock"))
    return setUserBlocked(request, path.split("/")[2], false);
  if (request.method === "POST" && path.startsWith("admin/users/") && path.endsWith("/delete"))
    return deleteUser(request, path.split("/")[2]);
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
    return processWithdrawal(request, path.split("/")[2], "selesai");
  if (
    request.method === "POST" &&
    path.startsWith("admin/withdrawals/") &&
    path.endsWith("/reject")
  )
    return processWithdrawal(request, path.split("/")[2], "ditolak");
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
    },
  },
});
