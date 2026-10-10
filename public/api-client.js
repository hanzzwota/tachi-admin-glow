(() => {
  const api = async (path, options = {}) => {
    const response = await fetch(`/api/${path}`, {
      credentials: "include",
      headers: { "content-type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Permintaan gagal");
    return data;
  };
  const toast = (message) => window.showToast?.(message);
  const format = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;
  const state = { user: null, settings: null, deposits: [], withdrawals: [] };
  window.tachiApiState = state;
  const addAdminModeButton = (user) => {
    const existing = document.getElementById("adminModeSwitch");
    if (user.role !== "admin") {
      existing?.remove();
      return;
    }
    if (existing) return;
    const button = document.createElement("button");
    button.id = "adminModeSwitch";
    button.type = "button";
    button.textContent = "Dashboard Admin";
    button.className =
      "fixed top-3 right-3 z-50 rounded-xl bg-blue-600 px-3 py-2 text-[11px] font-extrabold text-white shadow-lg";
    button.onclick = () => {
      window.top.location.href = "/admin";
    };
    document.body.appendChild(button);
  };
  const greeting = () => {
    const hour = new Date().getHours();
    if (hour >= 4 && hour < 11) return "Selamat pagi";
    if (hour >= 11 && hour < 15) return "Selamat siang";
    if (hour >= 15 && hour < 18) return "Selamat sore";
    return "Selamat malam";
  };
  const applyUserDom = () => {
    const { user, settings } = state;
    if (!user || !settings) return;
    ["dashboardBalance", "saldoBalance", "withdrawAvailableBalance", "profileBalance"].forEach(
      (id) => {
        const element = document.getElementById(id);
        if (element) element.textContent = format(user.balance);
      },
    );
    ["gmailRateTop", "gmailRateSaldo"].forEach((id) => {
      const element = document.getElementById(id);
      if (element) element.textContent = `${format(settings.rate)} / Gmail`;
    });
    const welcome = document.getElementById("welcomeGreeting");
    if (welcome) welcome.textContent = `${greeting()}, ${user.displayName || user.username}`;
    const profileName = document.getElementById("profileDisplayName");
    if (profileName) profileName.textContent = user.displayName || user.username;
    const profileUsername = document.getElementById("profileUsername");
    if (profileUsername) profileUsername.textContent = `Username: @${user.username}`;
    const campaign = document.getElementById("requiredPasswordText");
    if (campaign) campaign.textContent = settings.campaign_password;
    const min = Number(settings.min_withdrawal || 0);
    const amount = document.getElementById("withdrawalAmountInput");
    if (amount) {
      amount.placeholder = `Minimal penarikan ${format(min)}`;
      amount.disabled = settings.withdraw_open === false;
    }
    const submit = document.getElementById("gmailListInput");
    if (submit) submit.disabled = settings.store_open === false;
    const bank = user.wallet || {};
    const bankInput = document.getElementById("rekeningInput");
    if (bankInput && document.activeElement !== bankInput) bankInput.value = bank.number || "";
    const nameInput = document.getElementById("atasNamaInput");
    if (nameInput && document.activeElement !== nameInput) nameInput.value = bank.name || "";
    const summary = document.getElementById("summaryRekening");
    if (summary)
      summary.textContent = bank.number
        ? `${bank.bank || "DANA"} - ${bank.number}`
        : "Belum disimpan";
    const summaryName = document.getElementById("summaryAtasNama");
    if (summaryName) summaryName.textContent = bank.name || "-";
  };
  const renderHistory = (filter = window.activeRiwayatFilter || "semua") => {
    const container = document.getElementById("riwayatListContainer");
    if (!container) return;
    const statusMap = { diterima: "diterima", pending: "pending", gagal: "ditolak" };
    const records = state.deposits.filter(
      (item) => filter === "semua" || item.status === statusMap[filter],
    );
    if (!records.length) {
      container.innerHTML = `<div class="py-12 text-center text-sm font-bold text-slate-500">Belum ada riwayat setoran</div>`;
      return;
    }
    const labels = {
      pending: ["Menunggu", "bg-amber-50 text-amber-700"],
      diterima: ["Diterima", "bg-emerald-50 text-emerald-700"],
      ditolak: ["Gagal", "bg-rose-50 text-rose-700"],
    };
    container.innerHTML = records
      .map((item) => {
        const [label, style] = labels[item.status] || labels.pending;
        const earned = Number(item.earned || 0);
        const allEmails = Array.isArray(item.emails) ? item.emails : [];
        const accepted = Array.isArray(item.accepted_emails) ? item.accepted_emails : [];
        const rejected = Array.isArray(item.rejected_emails) ? item.rejected_emails : [];
        const emailList = (values) =>
          values
            .map(
              (email) =>
                `<div class="break-all py-0.5">${String(email).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char])}</div>`,
            )
            .join("");
        return `<article class="bg-white rounded-2xl p-4 border border-slate-100 card-soft-shadow text-left"><div class="flex items-center justify-between gap-3"><div><p class="font-mono text-xs font-bold text-slate-700">${item.id}</p><p class="text-[11px] text-slate-400 mt-1">${new Date(item.created_at).toLocaleString("id-ID")}</p></div><span class="${style} rounded-full px-2.5 py-1 text-[11px] font-extrabold">${label}</span></div><div class="mt-3 flex justify-between text-xs"><span class="text-slate-500">${allEmails.length} Gmail disetor</span><strong>${item.status === "diterima" ? `+${format(earned)}` : item.status === "ditolak" ? "Tidak dibayar" : "Diproses"}</strong></div>${item.status === "pending" ? `<div class="mt-3 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-700"><b>Email yang kamu setorkan:</b><div class="mt-1 max-h-48 overflow-y-auto font-mono">${emailList(allEmails)}</div></div>` : ""}${accepted.length ? `<div class="mt-3 rounded-lg bg-emerald-50 p-2 text-[11px] text-emerald-700"><b>Diterima:</b><div class="mt-1 max-h-40 overflow-y-auto font-mono">${emailList(accepted)}</div></div>` : ""}${rejected.length ? `<div class="mt-2 rounded-lg bg-rose-50 p-2 text-[11px] text-rose-700"><b>Ditolak:</b><div class="mt-1 max-h-40 overflow-y-auto font-mono">${emailList(rejected)}</div></div>` : ""}${item.reason ? `<p class="text-[11px] text-rose-600 mt-2">Alasan: ${item.reason}</p>` : ""}</article>`;
      })
      .join("");
  };
  const renderWithdrawals = () => {
    const container = document.getElementById("withdrawalHistoryContainer");
    if (!container) return;
    if (!state.withdrawals.length) {
      container.textContent = "Belum ada penarikan";
      return;
    }
    container.className = "space-y-2";
    container.innerHTML = state.withdrawals
      .slice(0, 5)
      .map(
        (item) =>
          `<div class="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs"><div><b>${format(item.amount)}</b><div class="text-slate-400">${new Date(item.created_at).toLocaleString("id-ID")}</div>${item.reason ? `<div class="text-rose-600">${item.reason}</div>` : ""}</div><span class="font-bold">${item.status === "selesai" ? "Selesai" : item.status === "ditolak" ? "Ditolak" : "Pending"}</span></div>`,
      )
      .join("");
  };
  window.renderRiwayat = renderHistory;
  async function syncAppData() {
    const [{ user }, { settings }, { deposits }, { withdrawals }] = await Promise.all([
      api("auth/me"),
      api("settings"),
      api("deposits"),
      api("withdrawals"),
    ]);
    if (!user) return null;
    state.user = user;
    state.settings = settings || {};
    state.deposits = Array.isArray(deposits) ? deposits : [];
    state.withdrawals = Array.isArray(withdrawals) ? withdrawals : [];
    addAdminModeButton(user);
    applyUserDom();
    renderHistory();
    renderWithdrawals();
    window.updateSlide?.();
    return state;
  }
  window.handleAuthSubmit = async (event) => {
    event.preventDefault();
    const fields = [...event.target.querySelectorAll("input")];
    const isRegister = fields.length > 2;
    try {
      const payload = isRegister
        ? { displayName: fields[0].value, username: fields[1].value, password: fields[3].value }
        : { username: fields[0].value, password: fields[1].value };
      const result = await api(isRegister ? "auth/register" : "auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (result.user.role === "admin") {
        location.href = "/admin";
        return;
      }
      await syncAppData();
      toast(isRegister ? "Akun berhasil dibuat" : "Login berhasil");
      setTimeout(() => window.navigateTo?.("dashboard"), 250);
    } catch (error) {
      toast(error.message);
    }
  };
  window.submitGmailStoran = async () => {
    const input = document.getElementById("gmailListInput");
    const emails =
      input?.value
        .split(/\s+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean) || [];
    try {
      await api("deposits", {
        method: "POST",
        body: JSON.stringify({ emails, campaignPassword: state.settings?.campaign_password }),
      });
      input.value = "";
      await syncAppData();
      toast("Setoran Gmail berhasil dikirim dan menunggu validasi admin");
      setTimeout(() => window.navigateTo?.("riwayat"), 300);
    } catch (error) {
      toast(error.message);
    }
  };
  window.copyCampaignPassword = async () => {
    try {
      await navigator.clipboard.writeText(state.settings?.campaign_password || "");
      toast("Password berhasil disalin");
    } catch (error) {
      toast(error.message);
    }
  };
  window.generateStockGmail = async () => {
    try {
      const { gmail } = await api("stock/claim", { method: "POST" });
      const input = document.getElementById("gmailListInput");
      if (input) {
        input.value = input.value.trim() ? `${input.value.trim()}\n${gmail}` : gmail;
        input.dispatchEvent(new Event("input"));
      }
      toast(`Gmail stok berhasil ditambahkan: ${gmail}`);
    } catch (error) {
      toast(error.message);
    }
  };
  window.saveBankDetails = async () => {
    const bank = document.getElementById("bankSelect")?.value || "DANA";
    const name = document.getElementById("atasNamaInput")?.value.trim() || "";
    const number = document.getElementById("rekeningInput")?.value.trim() || "";
    try {
      await api("wallet", { method: "PATCH", body: JSON.stringify({ bank, name, number }) });
      await syncAppData();
      toast("Data rekening berhasil disimpan");
    } catch (error) {
      toast(error.message);
    }
  };
  window.handleTarikSaldo = async () => {
    const amount = Number(document.getElementById("withdrawalAmountInput")?.value);
    try {
      await api("withdrawals", { method: "POST", body: JSON.stringify({ amount }) });
      document.getElementById("withdrawalAmountInput").value = "";
      await syncAppData();
      toast("Permintaan penarikan diproses");
    } catch (error) {
      toast(error.message);
    }
  };
  window.updatePassword = () => toast("Perubahan kata sandi belum tersedia pada backend");
  window.logout = async () => {
    try {
      await api("auth/logout", { method: "POST" });
    } catch {}
    location.href = "/login";
  };
  window.addEventListener("DOMContentLoaded", async () => {
    try {
      const { user } = await api("auth/me");
      const requestedView = new URLSearchParams(location.search).get("view");
      if (user) {
        await syncAppData();
        if (requestedView && !["login", "register"].includes(requestedView))
          setTimeout(() => window.navigateTo?.(requestedView), 0);
      } else if (!["login", "register"].includes(requestedView || "login"))
        window.navigateTo?.("login");
    } catch (error) {
      console.warn("Backend belum siap:", error.message);
    }
  });
})();
