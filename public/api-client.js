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
  const syncAdminProfileAction = (user) => {
    const action = document.getElementById("adminProfileAction");
    if (!action) return;
    action.classList.toggle("hidden", user.role !== "admin");
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
    window.syncUserBankDataFromApi?.(bank);
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
    const feeLabel = document.getElementById("withdrawFeeLabel");
    const paymentFees =
      settings.payment_fees && typeof settings.payment_fees === "object"
        ? settings.payment_fees
        : {};
    if (feeLabel)
      feeLabel.textContent = `Fee ${bank.bank || "DANA"}: ${format(Number(paymentFees[bank.bank || "DANA"] ?? settings.fee ?? 0))}`;
    const readyForWithdrawal = Boolean(bank.number && bank.name);
    const dashboardWithdrawLabel = document.getElementById("btnTarikSaldoText");
    const saldoWithdrawLabel = document.getElementById("withdrawButtonLabel");
    if (dashboardWithdrawLabel)
      dashboardWithdrawLabel.textContent = readyForWithdrawal ? "Tarik Sekarang" : "Tarik Saldo";
    if (saldoWithdrawLabel)
      saldoWithdrawLabel.textContent = readyForWithdrawal
        ? "Tarik Sekarang"
        : "Isi rekening terlebih dahulu";
    const dailyUsed = Number(settings.daily_used || 0);
    const dailyLimit = Number(settings.daily_limit || 0);
    const dailyRemaining =
      settings.daily_remaining == null ? null : Number(settings.daily_remaining);
    const dailyUsage = document.getElementById("dailyDepositUsage");
    const dailyRemainingEl = document.getElementById("dailyDepositRemaining");
    const dailyProgress = document.getElementById("dailyDepositProgress");
    if (dailyUsage) dailyUsage.textContent = `${dailyUsed}/${dailyLimit || "∞"}`;
    if (dailyRemainingEl)
      dailyRemainingEl.textContent = `· Sisa ${dailyRemaining == null ? "∞" : dailyRemaining}`;
    if (dailyProgress)
      dailyProgress.style.width = `${dailyLimit ? Math.min(100, (dailyUsed / dailyLimit) * 100) : 0}%`;
    syncAdminProfileAction(user);
    const storeClosed = settings.store_open === false;
    const storeBanner = document.getElementById("storeStatusBanner");
    const storeButton = document.querySelector('button[onclick="submitGmailStoran()"]');
    if (storeBanner) {
      storeBanner.className = storeClosed
        ? "rounded-2xl border border-rose-200 bg-rose-50 p-3.5 flex items-center gap-3 text-xs font-bold text-rose-700"
        : "hidden rounded-2xl border p-3.5 flex items-center gap-3 text-xs font-bold";
      storeBanner.innerHTML = storeClosed
        ? '<i class="fa-solid fa-lock text-rose-500"></i><span>Setoran sedang ditutup admin. Silakan coba lagi nanti.</span>'
        : "";
    }
    if (storeButton) {
      storeButton.disabled = storeClosed;
      storeButton.classList.toggle("opacity-50", storeClosed);
      storeButton.classList.toggle("cursor-not-allowed", storeClosed);
      const label = storeButton.querySelector("span");
      if (label) label.textContent = storeClosed ? "Setoran sedang ditutup" : "Kirim setoran";
    }
    const withdrawClosed = settings.withdraw_open === false;
    const withdrawBanner = document.getElementById("withdrawStatusBanner");
    const withdrawBadge = document.getElementById("withdrawStatusBadge");
    const withdrawText = document.getElementById("withdrawStatusText");
    const withdrawBannerText = document.getElementById("withdrawStatusBannerText");
    if (withdrawBanner)
      withdrawBanner.className = withdrawClosed
        ? "bg-rose-50 border border-rose-200/80 rounded-2xl p-3 flex items-center justify-center gap-2 text-xs font-extrabold text-rose-700"
        : "bg-emerald-50 border border-emerald-200/80 rounded-2xl p-3 flex items-center justify-center gap-2 text-xs font-extrabold text-emerald-700";
    if (withdrawBannerText)
      withdrawBannerText.textContent = withdrawClosed
        ? "Status Penarikan: • Ditutup admin"
        : "Status Penarikan: • Dibuka";
    if (withdrawBadge)
      withdrawBadge.className = withdrawClosed
        ? "bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1"
        : "bg-emerald-50 border border-emerald-200 text-emerald-600 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1";
    if (withdrawText) withdrawText.textContent = withdrawClosed ? "Ditutup" : "Aktif";
    document.querySelectorAll('button[onclick="handleTarikSaldo()"]').forEach((button) => {
      button.disabled = withdrawClosed;
      button.classList.toggle("opacity-50", withdrawClosed);
      button.classList.toggle("cursor-not-allowed", withdrawClosed);
    });
    const checkerClosed = settings.checker_open === false;
    const checkerButton = document.getElementById("checkerFeatureButton");
    const checkerLabel = document.getElementById("checkerFeatureLabel");
    if (checkerButton) checkerButton.classList.toggle("opacity-50", checkerClosed);
    if (checkerLabel) checkerLabel.textContent = checkerClosed ? "Checker (Ditutup)" : "Checker";
  };
  const renderHistory = (filter = window.activeRiwayatFilter || "semua") => {
    const container = document.getElementById("riwayatListContainer");
    if (!container) return;
    const statusMap = { diterima: "diterima", pending: "pending", gagal: "ditolak" };
    const records = state.deposits.filter(
      (item) => filter === "semua" || item.status === statusMap[filter],
    );
    const wibDate = (value) =>
      new Date(new Date(value).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() + 7 * 60 * 60 * 1000 - 86400000)
      .toISOString()
      .slice(0, 10);
    const recap = (date) =>
      state.deposits
        .filter((item) => wibDate(item.created_at) === date)
        .reduce(
          (result, item) => ({
            gmail:
              result.gmail +
              (Array.isArray(item.accepted_emails)
                ? item.accepted_emails.length
                : Number(item.accepted_count || 0)),
            earned: result.earned + Number(item.earned || 0),
          }),
          { gmail: 0, earned: 0 },
        );
    const todayRecap = recap(today);
    const yesterdayRecap = recap(yesterday);
    const todayEl = document.getElementById("recapToday");
    const yesterdayEl = document.getElementById("recapYesterday");
    if (todayEl) todayEl.textContent = `${todayRecap.gmail} Gmail · ${format(todayRecap.earned)}`;
    if (yesterdayEl)
      yesterdayEl.textContent = `${yesterdayRecap.gmail} Gmail · ${format(yesterdayRecap.earned)}`;
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
  window.openChecker = () => {
    if (state.settings?.checker_open === false) {
      toast("Checker sedang ditutup admin. Silakan coba lagi nanti");
      return;
    }
    window.openModal?.(
      "Email Checker",
      "Gunakan tachi69gmail tool untuk memeriksa status email secara otomatis",
    );
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
    if (document.getElementById("savePaymentButton")?.disabled) {
      toast("Tekan Edit Nomor terlebih dahulu");
      return;
    }
    const bank = document.getElementById("bankSelect")?.value || "DANA";
    const name = document.getElementById("atasNamaInput")?.value.trim() || "";
    const number = document.getElementById("rekeningInput")?.value.trim() || "";
    try {
      const result = await api("wallet", {
        method: "PATCH",
        body: JSON.stringify({ bank, name, number }),
      });
      if (result.wallet) {
        state.user.wallet = {
          bank: result.wallet.wallet_bank || bank,
          name: result.wallet.wallet_name || name,
          number: result.wallet.wallet_number || number,
        };
      }
      await syncAppData();
      window.setPaymentEditMode?.(false);
      toast("Data rekening berhasil disimpan");
    } catch (error) {
      toast(error.message);
    }
  };
  window.handleTarikSaldo = async () => {
    const wallet = state.user?.wallet || {};
    const bank = wallet.bank || "DANA";
    const number = wallet.number || "";
    if (!number || !wallet.name) {
      toast("Isi rekening di Profil terlebih dahulu");
      return;
    }
    const confirmed = window.confirm(
      `Pastikan nomor ${bank} ini benar:\n\n${number}\n\nJika Nomor Salah/Tidak Sesuai Dengan Nomor Payment Anda Admin Tidak Berhak Bertanggung Jawab.\n\nLanjut tarik saldo?`,
    );
    if (!confirmed) return;
    const amount = Number(document.getElementById("withdrawalAmountInput")?.value);
    try {
      await api("withdrawals", {
        method: "POST",
        body: JSON.stringify({ amount, confirmWallet: true }),
      });
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
        window.setInterval(() => {
          if (document.visibilityState === "visible") syncAppData().catch(() => {});
        }, 20000);
        if (requestedView && !["login", "register"].includes(requestedView))
          setTimeout(() => window.navigateTo?.(requestedView), 0);
      } else if (!["login", "register"].includes(requestedView || "login"))
        window.navigateTo?.("login");
    } catch (error) {
      console.warn("Backend belum siap:", error.message);
    }
  });
})();
