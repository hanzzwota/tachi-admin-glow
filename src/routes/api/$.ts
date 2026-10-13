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
const FIXED_MIN_WITHDRAWAL = 15000;
function normalizeFee(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount / FEE_STEP) * FEE_STEP;
}
function isValidFee(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) && amount >= 0 && amount % FEE_STEP === 0;
}
// DANA mengikuti konfigurasi admin; metode lain wajib minimal Rp15.000.
function withdrawalMinimums(adminMin: unknown) {
  const dana = Math.max(0, Math.floor(Number(adminMin ?? 0)) || 0);
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
  return { admins };
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
    ? "deposits?select=*,profiles(username,display_name)&order=created_at.desc&limit=500"
    : `deposits?select=*&user_id=eq.${encodeURIComponent(String(user.id))}&order=created_at.desc&limit=100`;
  const rows = await supabaseFetch<Record<string, unknown>[]>(query);
  return json({ deposits: rows });
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
  const emails = Array.isArray(payload.emails)
    ? [...new Set(payload.emails.map(text).filter(Boolean))]
    : [];
  if (!emails.length || emails.some((email) => !/^[a-z0-9._%+-]{1,64}@gmail\.com$/i.test(email)))
    return json({ error: "Daftar Gmail tidak valid" }, { status: 400 });
  const settings = await getSettings();
  if (!settings?.store_open)
    return json({ error: "Setoran sedang ditutup oleh admin" }, { status: 423 });
  if (text(payload.campaignPassword) !== String(settings.campaign_password))
    return json({ error: "Password wajib salah" }, { status: 403 });
  if (emails.length > Number(settings.batch_limit))
    return json({ error: `Maksimal ${settings.batch_limit} Gmail per transaksi` }, { status: 400 });
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
    body: JSON.stringify({ user_id: user.id, emails, status: "pending" }),
  });
  return json({ deposit: rows[0] }, { status: 201 });
}

async function approveDeposit(request: Request, id: string) {
  await requireAdmin(request);
  const payload = await body(request);
  const rows = await supabaseFetch<Record<string, unknown>[]>(
    `deposits?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  const deposit = rows[0];
  if (!deposit || deposit.status !== "pending")
    return json({ error: "Setoran tidak ditemukan atau sudah diproses" }, { status: 409 });
  const settings = await getSettings();
  const emailList = Array.isArray(deposit.emails) ? deposit.emails.map(text) : [];
  const requested = Array.isArray(payload.acceptedEmails)
    ? [...new Set(payload.acceptedEmails.map(text))]
    : emailList.slice(
        0,
        Math.max(0, Math.min(emailList.length, Number(payload.acceptedCount ?? emailList.length))),
      );
  const previousAccepted = Array.isArray(deposit.accepted_emails)
    ? deposit.accepted_emails.map(text)
    : [];
  const acceptedEmails = [...new Set([...previousAccepted, ...requested])].filter((email) =>
    emailList.includes(email),
  );
  const rejectedEmails = Array.isArray(deposit.rejected_emails)
    ? deposit.rejected_emails.map(text).filter((email) => emailList.includes(email))
    : [];
  const newlyAccepted = acceptedEmails.filter((email) => !previousAccepted.includes(email));
  const acceptedCount = acceptedEmails.length;
  const earned = newlyAccepted.length * Number(settings?.rate ?? 0);
  await supabaseFetch(`deposits?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: acceptedCount === emailList.length ? "diterima" : "pending",
      accepted_count: acceptedCount,
      accepted_emails: acceptedEmails,
      rejected_emails: rejectedEmails,
      earned,
      reason: rejectedEmails.length ? `${rejectedEmails.length} Gmail tidak diterima` : null,
      verified_at: new Date().toISOString(),
    }),
  });
  const userRows = await supabaseFetch<Record<string, unknown>[]>(
    `profiles?select=balance& id=eq.${encodeURIComponent(String(deposit.user_id))}`.replace(
      "?select=balance& ",
      "?select=balance&",
    ),
  );
  const currentBalance = Number(userRows[0]?.balance ?? 0);
  await supabaseFetch(`profiles?id=eq.${encodeURIComponent(String(deposit.user_id))}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ balance: currentBalance + earned }),
  });
  return json({ ok: true, earned });
}

async function rejectDeposit(request: Request, id: string) {
  await requireAdmin(request);
  const payload = await body(request);
  const rows = await supabaseFetch<Record<string, unknown>[]>(
    `deposits?select=*&id=eq.${encodeURIComponent(id)}&status=eq.pending&limit=1`,
  );
  const deposit = rows[0];
  if (!deposit)
    return json({ error: "Setoran tidak ditemukan atau sudah diproses" }, { status: 409 });
  const emailList = Array.isArray(deposit.emails) ? deposit.emails.map(text) : [];
  if (Array.isArray(payload.rejectedEmails) && payload.rejectedEmails.length === 0)
    return json({ error: "Pilih minimal satu Gmail untuk ditolak" }, { status: 400 });
  const rejectedEmails = Array.isArray(payload.rejectedEmails)
    ? [...new Set(payload.rejectedEmails.map(text))].filter((email) => emailList.includes(email))
    : emailList;
  const acceptedEmails = emailList.filter((email) => !rejectedEmails.includes(email));
  const settings = await getSettings();
  const earned = acceptedEmails.length * Number(settings?.rate ?? 0);
  await supabaseFetch(`deposits?id=eq.${encodeURIComponent(id)}&status=eq.pending`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: acceptedEmails.length ? "diterima" : "ditolak",
      accepted_count: acceptedEmails.length,
      accepted_emails: acceptedEmails,
      rejected_emails: rejectedEmails,
      earned,
      reason: text(payload.reason) || "Ditolak admin",
      verified_at: new Date().toISOString(),
    }),
  });
  if (earned) {
    const userRows = await supabaseFetch<Record<string, unknown>[]>(
      `profiles?select=balance&id=eq.${encodeURIComponent(String(deposit.user_id))}&limit=1`,
    );
    await supabaseFetch(`profiles?id=eq.${encodeURIComponent(String(deposit.user_id))}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ balance: Number(userRows[0]?.balance ?? 0) + earned }),
    });
  }
  return json({ ok: true, earned });
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
  const allowed = {
    rate: numberOrZero(payload.rate ?? current?.rate),
    min_withdrawal: numberOrZero(payload.minWithdrawal ?? current?.min_withdrawal),
    fee: normalizeFee(payload.fee ?? current?.fee),
    payment_fees: canonicalPaymentFees(
      payload.paymentFees ?? current?.payment_fees,
      normalizeFee(payload.fee ?? current?.fee),
    ),
    campaign_password: text(payload.campaignPassword ?? current?.campaign_password),
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
  ] as const) {
    try {
      await patchSettings({ [optionalSetting[0]]: optionalSetting[1] });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const optionalColumnMissing =
        message.includes("PGRST204") ||
        (message.includes("400") && message.includes(optionalSetting[0]));
      if (!optionalColumnMissing) throw error;
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
  await requireUser(request);
  const settings = await getSettings();
  if (!settings?.auto_stock_enabled)
    return json({ error: "Generate Gmail sedang dimatikan admin" }, { status: 423 });
  const stock = Array.isArray(settings.gmail_stock) ? settings.gmail_stock : [];
  const item = stock.shift();
  if (!item) return json({ error: "Stok Gmail sedang kosong" }, { status: 409 });
  await supabaseFetch("app_settings?id=eq.1", {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ gmail_stock: stock }),
  });
  return json({ gmail: item });
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
  if (amount + fee > balance) return json({ error: "Saldo tidak cukup" }, { status: 400 });
  if (!user.wallet_number || !user.wallet_name)
    return json({ error: "Isi data rekening terlebih dahulu" }, { status: 400 });
  if (payload.confirmWallet !== true)
    return json({ error: "Konfirmasi nomor payment terlebih dahulu" }, { status: 400 });
  const updatedProfiles = await supabaseFetch<Record<string, unknown>[]>(
    `profiles?id=eq.${encodeURIComponent(String(user.id))}&balance=eq.${encodeURIComponent(String(balance))}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ balance: balance - amount - fee }),
    },
  );
  if (!updatedProfiles.length)
    return json({ error: "Saldo berubah, silakan muat ulang lalu coba lagi" }, { status: 409 });
  const restoreBalance = () =>
    supabaseFetch(
      `profiles?id=eq.${encodeURIComponent(String(user.id))}&balance=eq.${encodeURIComponent(String(balance - amount - fee))}`,
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
      : Number(withdrawal.amount ?? 0) + Number(withdrawal.fee ?? 0);
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
