(() => {
  // Semua request ke backend. Melempar Error bila jaringan gagal, HTTP bukan 2xx,
  // atau backend mengembalikan field `error` — sehingga pemanggil hanya
  // menampilkan toast success setelah `await api(...)` benar-benar berhasil.
  const api = async (path, options = {}) => {
    let response;
    try {
      response = await fetch(`/api/${path}`, {
        credentials: "include",
        ...options,
        headers: { "content-type": "application/json", ...(options.headers || {}) },
      });
    } catch (cause) {
      console.error(`[api] Fetch Error /api/${path}:`, cause);
      const error = new Error("Koneksi gagal! Periksa jaringan Anda lalu coba lagi.");
      error.isNetworkError = true;
      error.cause = cause;
      throw error;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      const error = new Error(data.error || data.message || `Permintaan gagal (HTTP ${response.status})`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  };
  const showToast = (type, message) => window.showToast?.(type, message);
  const errorText = (error, fallback) => window.toastErrorMessage?.(error, fallback) || fallback;
  const format = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;
  const paymentMethods = ["DANA", "OVO", "GoPay", "ShopeePay", "BCA", "BRI", "Mandiri"];
  const FEE_STEP = 1000;
  const FIXED_MIN_WITHDRAWAL = 15000;
  const normalizeFee = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    return Math.round(amount / FEE_STEP) * FEE_STEP;
  };
  const minWithdrawalFor = (bank, settings) =>
    Number(
      settings?.withdrawal_minimums?.[bank] ??
        (bank === "DANA" ? Number(settings?.min_withdrawal || 0) : FIXED_MIN_WITHDRAWAL),
    );
  const paymentKey = (value) =>
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const normalizePaymentFees = (value, fallback = 0) => {
    const source = value && typeof value === "object" ? value : {};
    return Object.fromEntries(
      paymentMethods.map((method) => {
        const entry = Object.entries(source).find(
          ([key]) => paymentKey(key) === paymentKey(method),
        );
        return [method, normalizeFee(entry?.[1] ?? fallback)];
      }),
    );
  };
  const feeFor = (fees, method, fallback = 0) => {
    const key = paymentKey(method || "DANA");
    const entry = Object.entries(fees || {}).find(([name]) => paymentKey(name) === key);
    return Math.max(0, Number(entry?.[1] ?? fallback));
  };
  const minimumFor = (method, configured = 4000) =>
    String(method || "DANA") === "DANA" ? Math.max(4000, configured) : Math.max(15000, configured);
  const escapeHtml = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (character) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
    );
  const state = { user: null, settings: null, deposits: [], withdrawals: [] };
  window.tachiApiState = state;
  const isDanaOnly = () => state.settings?.payment_mode === "dana_only";
  const resetPaymentToDana = () => {
    if (!state.user) return;
    state.user.wallet = { ...(state.user.wallet || {}), bank: "DANA", name: "", number: "" };
    window.syncUserBankDataFromApi?.(state.user.wallet);
    const number = document.getElementById("rekeningInput");
    const name = document.getElementById("atasNamaInput");
    if (number) number.value = "";
    if (name) name.value = "";
    const bank = document.getElementById("bankSelect");
    if (bank) bank.value = "DANA";
  };
  window.handlePaymentModeChange = (select) => {
    if (isDanaOnly() && select.value !== "DANA") {
      select.value = "DANA";
      resetPaymentToDana();
      showToast("warning", "⚠️ Admin hanya membuka payment DANA. Silakan isi ulang data payment DANA.");
    }
  };
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
  const displayNameFor = (user) =>
    String(user?.displayName || "").trim() ||
    String(user?.display_name || "").trim() ||
    String(user?.username || "").trim() ||
    "Pengguna";
  const applyIdentityToDom = (user) => {
    if (!user) return;
    const displayName = displayNameFor(user);
    const welcome = document.getElementById("welcomeGreeting");
    if (welcome) welcome.textContent = `${greeting()}, ${displayName}`;
    const profileName = document.getElementById("profileDisplayName");
    if (profileName) profileName.textContent = displayName;
    const profileUsername = document.getElementById("profileUsername");
    if (profileUsername) profileUsername.textContent = `Username: @${user.username || ""}`;
  };
  const applyUserDom = () => {
    const { user, settings } = state;
    applyIdentityToDom(user);
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
    const campaign = document.getElementById("requiredPasswordText");
    if (campaign) campaign.textContent = settings.campaign_password;
    const danaOnly = isDanaOnly();
    const bankSelect = document.getElementById("bankSelect");
    if (bankSelect) {
      paymentMethods.forEach((method) => {
        const option = [...bankSelect.options].find((item) => item.value === method);
        if (option) option.disabled = danaOnly && method !== "DANA";
      });
      if (danaOnly && user.wallet?.bank !== "DANA") resetPaymentToDana();
      bankSelect.value = danaOnly ? "DANA" : user.wallet?.bank || "DANA";
    }
    const currentBank = (user.wallet && user.wallet.bank) || state.user?.wallet?.bank || "DANA";
    const min = minWithdrawalFor(currentBank, settings);
    const minInfo = document.getElementById("withdrawMinInfo");
    if (minInfo)
      minInfo.textContent = `Minimal penarikan ${currentBank} ${format(min)}. DANA mengikuti setelan admin, OVO/GoPay/ShopeePay/BCA/BRI/Mandiri minimal ${format(FIXED_MIN_WITHDRAWAL)}.`;
    const amount = document.getElementById("withdrawalAmountInput");
    if (amount) {
      amount.placeholder = `Minimal penarikan ${format(min)}`;
      amount.disabled = settings.withdraw_open === false;
    }
    const submit = document.getElementById("gmailListInput");
    if (submit) submit.disabled = settings.store_open === false;
    const incomingWallet = user.wallet || {};
    const previousWallet = state.user?.wallet || {};
    const bank = incomingWallet.number && incomingWallet.name ? incomingWallet : previousWallet;
    window.syncUserBankDataFromApi?.(bank);
    const bankInput = document.getElementById("rekeningInput");
    if (bankInput && document.activeElement !== bankInput) bankInput.value = bank.number || "";
    const nameInput = document.getElementById("atasNamaInput");
    if (nameInput && document.activeElement !== nameInput) nameInput.value = bank.name || "";
    const paymentModeNotice = document.getElementById("paymentModeNotice");
    if (paymentModeNotice) {
      paymentModeNotice.textContent = danaOnly
        ? "Admin hanya membuka payment DANA. Payment selain DANA harus diisi ulang ke DANA."
        : "Semua payment tersedia sesuai konfigurasi admin.";
      paymentModeNotice.className = danaOnly
        ? "mt-2 block text-[11px] font-bold text-amber-700"
        : "mt-2 block text-[11px] font-medium text-slate-500";
    }
    const summary = document.getElementById("summaryRekening");
    if (summary)
      summary.textContent = bank.number
        ? `${bank.bank || "DANA"} - ${bank.number}`
        : "Belum disimpan";
    const summaryName = document.getElementById("summaryAtasNama");
    if (summaryName) summaryName.textContent = bank.name || "-";
    const feeLabel = document.getElementById("withdrawFeeLabel");
    const paymentFees = normalizePaymentFees(settings.payment_fees, normalizeFee(settings.fee));
    if (feeLabel)
      feeLabel.textContent = `Fee ${bank.bank || "DANA"}: ${format(paymentFees[bank.bank || "DANA"] ?? 0)}`;
    const readyForWithdrawal = Boolean(bank.number && bank.name);
    const dashboardWithdrawLabel = document.getElementById("btnTarikSaldoText");
    const saldoWithdrawLabel = document.getElementById("withdrawButtonLabel");
    if (dashboardWithdrawLabel)
      dashboardWithdrawLabel.textContent = readyForWithdrawal
        ? "Tarik Sekarang"
        : "Isi Terlebih Dahulu";
    const saldoTopWithdrawLabel = document.getElementById("saldoTopWithdrawLabel");
    if (saldoTopWithdrawLabel)
      saldoTopWithdrawLabel.textContent = readyForWithdrawal
        ? "Tarik Sekarang"
        : "Isi Terlebih Dahulu";
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
    const { user } = await api("auth/me");
    if (!user) return null;
    const previousUser = state.user;
    const incomingWallet = user.wallet || {};
    const previousWallet = previousUser?.wallet || {};
    const wallet = incomingWallet.number && incomingWallet.name ? incomingWallet : previousWallet;
    state.user = {
      ...previousUser,
      ...user,
      username: user.username || previousUser?.username || "",
      displayName: displayNameFor(user),
      wallet,
    };
    applyUserDom();
    const [settingsResult, depositsResult, withdrawalsResult] = await Promise.allSettled([
      api("settings"),
      api("deposits"),
      api("withdrawals"),
    ]);
    if (settingsResult.status === "fulfilled") {
      const settings = settingsResult.value.settings || {};
      state.settings = {
        ...settings,
        payment_fees: normalizePaymentFees(settings.payment_fees, Number(settings.fee || 0)),
      };
    } else {
      console.warn("Gagal memuat pengaturan aplikasi:", settingsResult.reason);
    }
    if (depositsResult.status === "fulfilled") {
      state.deposits = Array.isArray(depositsResult.value.deposits)
        ? depositsResult.value.deposits
        : [];
      renderHistory();
    } else {
      console.warn("Gagal memuat riwayat setoran:", depositsResult.reason);
    }
    if (withdrawalsResult.status === "fulfilled") {
      state.withdrawals = Array.isArray(withdrawalsResult.value.withdrawals)
        ? withdrawalsResult.value.withdrawals
        : [];
      renderWithdrawals();
    } else {
      console.warn("Gagal memuat riwayat penarikan:", withdrawalsResult.reason);
    }
    applyUserDom();
    window.updateSlide?.();
    return state;
  }
  window.handleAuthSubmit = async (event) => {
    event.preventDefault();
    const fields = [...event.target.querySelectorAll("input")];
    const isRegister = fields.length > 2;
    const payload = isRegister
      ? {
          displayName: fields[0].value.trim(),
          username: fields[1].value.trim(),
          password: fields[3].value,
        }
      : { username: fields[0].value.trim(), password: fields[1].value };

    // Validasi input -> WARNING (bukan error sistem, bukan success).
    if (!payload.username || !payload.password || (isRegister && !payload.displayName)) {
      showToast("warning", "⚠️ Harap isi semua kolom yang wajib!");
      return;
    }
    if (!/^[a-zA-Z0-9_.]{3,30}$/.test(payload.username)) {
      showToast("warning", "⚠️ Username 3-30 karakter: huruf, angka, titik, atau underscore.");
      return;
    }
    if (payload.password.length < 6) {
      showToast("warning", "⚠️ Kata sandi minimal 6 karakter.");
      return;
    }

    const submitButton = event.target.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    try {
      console.log(isRegister ? "Mencoba daftar dengan payload:" : "Mencoba login dengan payload:", {
        username: payload.username,
      });
      const result = await api(isRegister ? "auth/register" : "auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      console.log("Response dari server:", { user: result?.user?.username, role: result?.user?.role });

      // SUCCESS hanya jika server benar-benar mengembalikan user (sesi cookie sudah dibuat).
      if (!result || !result.user || !result.user.id) {
        showToast(
          "error",
          isRegister
            ? "Pendaftaran gagal! Server tidak mengembalikan data akun. Coba lagi. 😟"
            : "Login gagal! Server tidak mengembalikan sesi login. Coba lagi. 😟",
        );
        return;
      }
      if (result.user.role === "admin") {
        showToast("success", "Login admin berhasil! Mengalihkan ke dashboard admin... 🚀");
        setTimeout(() => window.top.location.assign("/admin"), 600);
        return;
      }
      showToast(
        "success",
        isRegister
          ? `Pendaftaran berhasil! Selamat datang, ${result.user.displayName || result.user.username}. 🎉`
          : "Login berhasil! Mengalihkan ke dashboard... 🚀",
      );
      try {
        await syncAppData();
      } catch (syncError) {
        console.error("Gagal memuat data akun:", syncError);
        showToast("warning", "⚠️ Anda sudah masuk, tetapi data akun belum termuat. Muat ulang halaman.");
      }
      setTimeout(() => window.navigateTo?.("dashboard"), 250);
    } catch (error) {
      console.error(isRegister ? "Register Error:" : "Login Error:", error);
      if (error.isNetworkError) {
        showToast("error", "Koneksi gagal! Silakan periksa jaringan Anda atau coba lagi nanti.");
      } else if (error.status === 429) {
        showToast("error", error.message || "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.");
      } else if (error.status >= 500) {
        showToast(
          "error",
          isRegister
            ? "Terjadi kesalahan sistem saat mendaftar. Coba lagi nanti."
            : "Terjadi kesalahan sistem saat mencoba login. Coba lagi nanti.",
        );
      } else {
        showToast(
          "error",
          error.message ||
            (isRegister
              ? "Pendaftaran gagal! Periksa kembali data Anda. 😟"
              : "Login gagal! Username atau password salah. 😟"),
        );
      }
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  };
  window.openChecker = () => {
    if (state.settings?.checker_open === false) {
      showToast("warning", "⚠️ Email Checker sedang ditutup admin. Silakan coba lagi nanti.");
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
    if (!emails.length) {
      showToast("warning", "⚠️ Masukkan minimal 1 alamat Gmail sebelum menyetor!");
      return;
    }
    if (state.settings?.store_open === false) {
      showToast("warning", "⚠️ Setoran Gmail sedang ditutup oleh admin.");
      return;
    }
    try {
      await api("deposits", {
        method: "POST",
        body: JSON.stringify({ emails, campaignPassword: state.settings?.campaign_password }),
      });
    } catch (error) {
      showToast("error", `Setoran Gmail gagal dikirim: ${errorText(error, "coba lagi nanti.")}`);
      return;
    }
    input.value = "";
    showToast("success", `${emails.length} Gmail berhasil disetor dan menunggu validasi admin!`);
    syncAppData().catch((error) => console.error("Gagal memuat ulang data:", error));
    setTimeout(() => window.navigateTo?.("riwayat"), 300);
  };
  window.copyCampaignPassword = async () => {
    const value = state.settings?.campaign_password || "";
    if (!value) {
      showToast("warning", "⚠️ Password wajib belum diatur admin.");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      showToast("success", "Password wajib berhasil disalin!");
    } catch (error) {
      showToast("error", "Gagal menyalin password wajib. Salin secara manual.");
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
      if (!gmail) {
        showToast("error", "Gagal mengambil Gmail stok: server tidak mengirim data.");
        return;
      }
      showToast("success", `Gmail stok berhasil ditambahkan: ${gmail}`);
    } catch (error) {
      showToast("error", `Gagal mengambil Gmail stok: ${errorText(error, "coba lagi nanti.")}`);
    }
  };
  window.saveBankDetails = async () => {
    if (document.getElementById("savePaymentButton")?.disabled) {
      showToast("warning", "⚠️ Tekan tombol Edit Nomor terlebih dahulu.");
      return;
    }
    const bank = document.getElementById("bankSelect")?.value || "DANA";
    const name = document.getElementById("atasNamaInput")?.value.trim() || "";
    const number = document.getElementById("rekeningInput")?.value.trim() || "";
    if (!name || !/^[0-9]{8,16}$/.test(number)) {
      showToast("warning", "⚠️ Nama pemilik wajib diisi dan nomor harus 8-16 digit angka.");
      return;
    }
    let result;
    try {
      result = await api("wallet", {
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
      if (result.user) {
        state.user = {
          ...state.user,
          ...result.user,
          username: state.user?.username || result.user.username,
          displayName: state.user?.displayName || result.user.displayName || result.user.username,
        };
      }
    } catch (error) {
      showToast("error", `Data payment gagal disimpan: ${errorText(error, "coba lagi nanti.")}`);
      return;
    }
    window.setPaymentEditMode?.(false);
    showToast("success", "Data payment berhasil disimpan!");
    syncAppData().catch((error) => console.error("Gagal memuat ulang data:", error));
  };
  window.handleTarikSaldo = async () => {
    const wallet = state.user?.wallet || {};
    const bank = wallet.bank || "DANA";
    const number = wallet.number || "";
    if (!number || !wallet.name) {
      showToast("warning", "⚠️ Isi data rekening di menu Profil terlebih dahulu.");
      return;
    }
    const amount = Number(document.getElementById("withdrawalAmountInput")?.value);
    const paymentFees = normalizePaymentFees(
      state.settings?.payment_fees,
      normalizeFee(state.settings?.fee),
    );
    const fee = paymentFees[bank] ?? 0;
    const minimum = minWithdrawalFor(bank, state.settings);
    const balance = Number(state.user?.balance || 0);
    if (!Number.isFinite(amount) || amount <= 0 || amount < minimum) {
      showToast("warning", `⚠️ Minimal penarikan ${bank} adalah ${format(minimum)}.`);
      return;
    }
    if (amount + fee > balance) {
      showToast("warning", "⚠️ Saldo tidak cukup untuk nominal penarikan dan fee.");
      return;
    }
    const modalBody = document.getElementById("modalBody");
    const modalTitle = document.getElementById("modalTitle");
    const modal = document.getElementById("appModal");
    if (!modalBody || !modalTitle || !modal) return;
    modalTitle.textContent = "Konfirmasi Tarik";
    modalBody.innerHTML = `<div class="space-y-2 text-xs"><div class="flex justify-between"><span>Metode payment</span><b>${escapeHtml(bank)}</b></div><div class="flex justify-between"><span>Nomor payment</span><b>${escapeHtml(number)}</b></div><div class="flex justify-between"><span>Nama pemilik</span><b>${escapeHtml(wallet.name)}</b></div><div class="flex justify-between"><span>Nominal penarikan</span><b>${format(amount)}</b></div><div class="flex justify-between"><span>Fee payment</span><b>${format(fee)}</b></div><div class="flex justify-between border-t pt-2"><span>Total saldo terpotong</span><b>${format(amount + fee)}</b></div><div class="flex justify-between"><span>Saldo bersih diterima</span><b>${format(amount)}</b></div><div class="rounded-xl bg-slate-100 p-3 text-slate-600">Pastikan nomor payment sudah benar. Jika Nomor Salah/Tidak Sesuai Dengan Nomor Payment Anda Admin Tidak Berhak Bertanggung Jawab.</div><div class="flex gap-2 pt-2"><button type="button" class="flex-1 rounded-xl border border-slate-200 px-3 py-2 font-bold" onclick="closeModal()">Kembali/Edit Nomor</button><button type="button" class="flex-1 rounded-xl bg-blue-600 px-3 py-2 font-bold text-white" id="confirmWithdrawalButton">Konfirmasi Tarik</button></div></div>`;
    modal.classList.remove("hidden");
    document.getElementById("confirmWithdrawalButton")?.addEventListener("click", async () => {
      const button = document.getElementById("confirmWithdrawalButton");
      if (button) button.disabled = true;
      closeModal();
      try {
        await api("withdrawals", {
          method: "POST",
          body: JSON.stringify({ amount, confirmWallet: true }),
        });
      } catch (error) {
        showToast("error", `Penarikan saldo gagal: ${errorText(error, "coba lagi nanti.")}`);
        if (button) button.disabled = false;
        return;
      }
      document.getElementById("withdrawalAmountInput").value = "";
      showToast("success", `Permintaan penarikan ${format(amount)} berhasil dikirim dan sedang diproses!`);
      syncAppData().catch((error) => console.error("Gagal memuat ulang data:", error));
    });
  };
  window.updatePassword = () =>
    showToast("warning", "⚠️ Fitur ganti kata sandi belum tersedia. Hubungi admin untuk reset.");
  window.logout = async () => {
    try {
      await api("auth/logout", { method: "POST" });
      showToast("success", "Logout berhasil. Mengalihkan ke halaman login.");
      setTimeout(() => window.top.location.assign("/login"), 350);
    } catch (error) {
      console.error("Logout Error:", error);
      showToast("error", `Logout gagal: ${errorText(error, "periksa koneksi lalu coba lagi.")}`);
    }
  };
  window.addEventListener("DOMContentLoaded", async () => {
    try {
      const { user } = await api("auth/me");
      const requestedView = new URLSearchParams(location.search).get("view");
      if (user) {
        applyIdentityToDom(user);
        const availableViews = ["dashboard", "stor", "saldo", "profil", "riwayat"];
        const initialView = availableViews.includes(requestedView) ? requestedView : "dashboard";
        window.navigateTo?.(initialView);
        await syncAppData();
        window.setInterval(() => {
          if (document.visibilityState === "visible") syncAppData().catch(() => {});
        }, 20000);
        const refreshWhenVisible = () => {
          if (document.visibilityState === "visible") syncAppData().catch(() => {});
        };
        document.addEventListener("visibilitychange", refreshWhenVisible);
        window.addEventListener("focus", refreshWhenVisible);
        window.addEventListener("pageshow", refreshWhenVisible);
      } else if (!["login", "register"].includes(requestedView || "login")) {
        window.top.location.replace("/login");
      }
    } catch (error) {
      console.error("Gagal memuat sesi akun:", error);
      showToast("error", `Gagal memuat sesi akun: ${errorText(error, "server tidak merespons.")}`);
    }
  });
})();
