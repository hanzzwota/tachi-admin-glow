import { createFileRoute } from "@tanstack/react-router";
import {
  clearSessionCookie,
  createSession,
  defaultSettingsRow,
  ensureSettingsRow,
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
      const created = await supabaseFetch<Record<string, unknown>[]>(