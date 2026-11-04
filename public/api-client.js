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
  let generatedGmailLoadErrorActive = false;
  const showGeneratedGmailError = (message) => {
    const alert = document.getElementById("stockGenerateAlert");
    if (alert) {
      alert.textContent = message;
      alert.classList.remove("hidden");
    }
  };
  const clearGeneratedGmailError = () => {
    generatedGmailLoadErrorActive = false;
    const alert = document.getElementById("stockGenerateAlert");
    if (alert) {
      alert.textContent = "";
      alert.classList.add("hidden");
    }
  };
  const format = (value) => `Rp${Number(value || 0).toLocaleString("id-ID")}`;
  const depositRateFor = (deposit) => {
    const route = String(deposit?.jalur || "PW").trim().toUpperCase();
    const configuredRate =
      route === "CAPTCHA" ? state.settings?.captcha_rate : state.settings?.pw_rate;
    return Number(deposit?.rate ?? configuredRate ?? state.settings?.rate ?? 4500);
  };
  const paymentMethods = ["DANA", "OVO", "GoPay", "ShopeePay", "BCA", "BRI", "Mandiri"];
  const FEE_STEP = 1000;
  const FIXED_MIN_WITHDRAWAL = 4000;
  const normalizeFee = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    return Math.round(amount / FEE_STEP) * FEE_STEP;
  };
  const minWithdrawalFor = (bank, settings) =>
    Math.max(
      FIXED_MIN_WITHDRAWAL,
      Number(
        settings?.withdrawal_minimums?.[bank] ??
          (bank === "DANA" ? Number(settings?.min_withdrawal || 0) : FIXED_MIN_WITHDRAWAL),
      ),
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
    Math.max(FIXED_MIN_WITHDRAWAL, Number(configured) || 0);
  const escapeHtml = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (character) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
    );
  const state = { user: null, settings: null, deposits: [], withdrawals: [] };
  let selectedDepositRoute = "PW";
  let depositSubmissionBusy = false;
  const generatedStockGmails = [];
  let selectedStockGenerateCount = 1;
  let stockGenerateTarget = 0;
  let stockGenerateCompleted = 0;
  let stockGenerateBusy = false;
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
  const dashboardDepositCounts = (deposits) => {
    const emailSet = (value) =>
      new Set((Array.isArray(value) ? value : []).map((email) => String(email).trim().toLowerCase()));
    let accepted = 0;
    let pending = 0;
    deposits.forEach((deposit) => {
      const emails = Array.isArray(deposit.emails) ? deposit.emails : [];
      const acceptedEmails = emailSet(deposit.accepted_emails);
      const rejectedEmails = emailSet(deposit.rejected_emails);
      const checkingEmails = emailSet([
        ...(Array.isArray(deposit.checked_emails) ? deposit.checked_emails : []),
        ...(Array.isArray(deposit.checking_emails) ? deposit.checking_emails : []),
        ...(Array.isArray(deposit.processing_emails) ? deposit.processing_emails : []),
      ]);
      const depositStatus = String(deposit.status || "pending").toLowerCase();
      const wholeDepositAccepted = ["diterima", "accepted"].includes(depositStatus);
      const wholeDepositRejected = ["ditolak", "rejected"].includes(depositStatus);
      const hasIndividualDecisions = acceptedEmails.size > 0 || rejectedEmails.size > 0;
      const checkingDeposit = [
        "dicek",
        "diperiksa",
        "diproses",
        "processing",
        "checking",
        "checked",
      ].includes(depositStatus);

      emails.forEach((email) => {
        const key = String(email).trim().toLowerCase();
        if (acceptedEmails.has(key) || (!hasIndividualDecisions && wholeDepositAccepted)) {
          accepted += 1;
        } else if (
          !rejectedEmails.has(key) &&
          (checkingEmails.has(key) || checkingDeposit || (!hasIndividualDecisions && !wholeDepositRejected))
        ) {
          pending += 1;
        }
      });
    });
    return { accepted, pending };
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
    const dashboardCounts = dashboardDepositCounts(state.deposits);
    const acceptedCount = document.getElementById("dashboardAcceptedCount");
    const pendingCount = document.getElementById("dashboardPendingCount");
    if (acceptedCount) acceptedCount.textContent = String(dashboardCounts.accepted);
    if (pendingCount) pendingCount.textContent = String(dashboardCounts.pending);
    if (settings.pw_enabled === false && settings.captcha_enabled === true)
      selectedDepositRoute = "CAPTCHA";
    if (settings.captcha_enabled !== true && settings.pw_enabled !== false)
      selectedDepositRoute = "PW";
    const pwRate = Number(settings.pw_rate ?? settings.rate ?? 0);
    const captchaRate = Number(settings.captcha_rate ?? settings.rate ?? 0);
    ["gmailRateTop", "gmailRateSaldo"].forEach((id) => {
      const element = document.getElementById(id);
      if (element)
        element.textContent = `${format(selectedDepositRoute === "CAPTCHA" ? captchaRate : pwRate)} / Gmail`;
    });
    const campaign = document.getElementById("requiredPasswordText");
    if (campaign) campaign.textContent = settings.campaign_password;
    const pwLabel = document.getElementById("pwRouteLabel");
    if (pwLabel) pwLabel.textContent = settings.pw_text || "PW";
    const pwPassword = document.getElementById("pwRoutePassword");
    if (pwPassword) pwPassword.textContent = `${settings.pw_text || "PW"}: ${settings.campaign_password || "-"}`;
    const pwRouteRate = document.getElementById("pwRouteRate");
    if (pwRouteRate) pwRouteRate.textContent = format(pwRate);
    const captchaRouteRate = document.getElementById("captchaRouteRate");
    if (captchaRouteRate) captchaRouteRate.textContent = format(captchaRate);
    const pwCard = document.getElementById("pwRouteCard");
    const captchaCard = document.getElementById("captchaRouteCard");
    if (pwCard) {
      pwCard.setAttribute("aria-pressed", String(selectedDepositRoute === "PW"));
      pwCard.disabled = settings.pw_enabled === false || depositSubmissionBusy;
      pwCard.classList.toggle("route-selected", selectedDepositRoute === "PW" && settings.pw_enabled !== false);
      pwCard.classList.toggle("route-unselected", selectedDepositRoute !== "PW" || settings.pw_enabled === false);
      pwCard.classList.toggle("opacity-60", settings.pw_enabled === false);
      pwCard.classList.toggle("cursor-not-allowed", settings.pw_enabled === false);
      const disabledText = document.getElementById("pwRouteDisabledText");
      if (disabledText) disabledText.classList.toggle("invisible", settings.pw_enabled !== false);
    }
    if (captchaCard) {
      captchaCard.setAttribute("aria-pressed", String(selectedDepositRoute === "CAPTCHA"));
      captchaCard.disabled = settings.captcha_enabled !== true || depositSubmissionBusy;
      captchaCard.classList.toggle("route-selected", selectedDepositRoute === "CAPTCHA" && settings.captcha_enabled === true);
      captchaCard.classList.toggle("route-unselected", selectedDepositRoute !== "CAPTCHA" || settings.captcha_enabled !== true);
      captchaCard.classList.toggle("opacity-60", settings.captcha_enabled !== true);
      captchaCard.classList.toggle("cursor-not-allowed", settings.captcha_enabled !== true);
      const disabledText = document.getElementById("captchaRouteDisabledText");
      if (disabledText) disabledText.classList.toggle("invisible", settings.captcha_enabled === true);
      const captchaIcon = captchaCard.querySelector(".route-icon");
      if (captchaIcon) captchaIcon.classList.toggle("opacity-60", settings.captcha_enabled !== true);
    }
    const captchaText = document.getElementById("captchaRouteText");
    if (captchaText) captchaText.textContent = settings.captcha_text || "CAPTCHA";
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
      minInfo.textContent = `Minimal penarikan ${currentBank} ${format(min)}. Semua metode minimal Rp4.000; DANA mengikuti setelan admin jika lebih tinggi.`;
    const amount = document.getElementById("withdrawalAmountInput");
    if (amount) {
      amount.placeholder = `Minimal penarikan ${format(min)}`;
      amount.disabled = settings.withdraw_open === false;
    }
    const submit = document.getElementById("gmailListInput");
    const storeIsClosed = settings.store_open === false;
    if (submit) submit.disabled = storeIsClosed;
    document.querySelectorAll("[data-store-closed-notice]").forEach((notice) => {
      notice.classList.toggle("hidden", !storeIsClosed);
    });
    document.querySelectorAll("[data-store-closed-reason]").forEach((reason) => {
      reason.textContent =
        String(settings.store_closed_reason || "").trim() ||
        "Admin belum menambahkan alasan penutupan.";
    });
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
  const renderHistory = (filter = window.activeRiwayatFilter || "semua", deposits = state.deposits) => {
    const container = document.getElementById("riwayatListContainer");
    if (!container) return;
    const statusLabels = {
      semua: "Semua",
      pending: "Pending",
      dicek: "Di Cek",
      diterima: "Diterima",
      ditolak: "Ditolak",
    };
    const statusStyle = {
      pending: ["Pending", "bg-amber-500 text-white", "fa-hourglass-half"],
      dicek: ["Di Cek", "bg-blue-600 text-white", "fa-magnifying-glass"],
      diterima: ["Diterima", "bg-emerald-600 text-white", "fa-circle-check"],
      ditolak: ["Ditolak", "bg-rose-600 text-white", "fa-circle-xmark"],
    };
    const emailSet = (value) =>
      new Set((Array.isArray(value) ? value : []).map((email) => String(email).trim().toLowerCase()));
    const rows = deposits.flatMap((deposit) => {
      const emails = Array.isArray(deposit.emails) ? deposit.emails : [];
      const accepted = emailSet(deposit.accepted_emails);
      const rejected = emailSet(deposit.rejected_emails);
      const checking = emailSet([
        ...(Array.isArray(deposit.checked_emails) ? deposit.checked_emails : []),
        ...(Array.isArray(deposit.checking_emails) ? deposit.checking_emails : []),
        ...(Array.isArray(deposit.processing_emails) ? deposit.processing_emails : []),
      ]);
      const hasIndividualDecisions = accepted.size > 0 || rejected.size > 0;
      const depositStatus = String(deposit.status || "pending").toLowerCase();
      const wholeDepositStatus = {
        diterima: "diterima",
        accepted: "diterima",
        ditolak: "ditolak",
        rejected: "ditolak",
      }[depositStatus];
      const checkingDeposit = ["dicek", "diperiksa", "diproses", "processing", "checking", "checked"].includes(depositStatus);
      const jalur = String(deposit.jalur || deposit.channel || deposit.source || deposit.path || "PW").trim();
      const rate = depositRateFor(deposit);
      const verifiedAt = deposit.verified_at || deposit.verifiedAt || deposit.reviewed_at || deposit.updated_at || null;
      return emails.map((email) => {
        const key = String(email).trim().toLowerCase();
        let status = "pending";
        if (accepted.has(key)) status = "diterima";
        else if (rejected.has(key)) status = "ditolak";
        else if (checking.has(key) || checkingDeposit) status = "dicek";
        else if (!hasIndividualDecisions && wholeDepositStatus) status = wholeDepositStatus;
        return {
          email: String(email),
          status,
          depositId: deposit.id,
          createdAt: deposit.created_at || deposit.date,
          verifiedAt: status === "pending" ? null : verifiedAt,
          reason: deposit.reason || "",
          transactionNumber: deposit.transaction_number || deposit.id,
          jalur,
          rate,
        };
      });
    });
    const counts = Object.fromEntries(
      ["pending", "dicek", "diterima", "ditolak"].map((status) => [
        status,
        rows.filter((row) => row.status === status).length,
      ]),
    );
    const countIds = {
      semua: rows.length,
      pending: counts.pending,
      dicek: counts.dicek,
      diterima: counts.diterima,
      ditolak: counts.ditolak,
    };
    Object.entries(countIds).forEach(([status, count]) => {
      const id = {
        semua: "riwayatCountSemua",
        pending: "riwayatCountPending",
        dicek: "riwayatCountDicek",
        diterima: "riwayatCountDiterima",
        ditolak: "riwayatCountDitolak",
      }[status];
      const element = document.getElementById(id);
      if (element) element.textContent = `(${count})`;
    });
    document.querySelectorAll(".riwayat-tab-btn").forEach((button) => {
      const active = button.dataset.riwayatStatus === filter;
      button.className = active
        ? "riwayat-tab-btn rounded-xl bg-blue-600 px-3 py-2 text-xs font-extrabold text-white shadow-sm"
        : "riwayat-tab-btn rounded-xl px-3 py-2 text-xs font-bold text-slate-200";
    });
    const jalurSelect = document.getElementById("riwayatJalurFilter");
    const selectedJalur = jalurSelect?.value || "semua";
    if (jalurSelect) {
      const jalurList = [...new Set(rows.map((row) => row.jalur).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "id"),
      );
      jalurSelect.innerHTML = `<option value="semua">Semua Jalur</option>${jalurList
        .map((jalur) => `<option value="${escapeHtml(jalur)}">${escapeHtml(jalur)}</option>`)
        .join("")}`;
      jalurSelect.value = jalurList.includes(selectedJalur) ? selectedJalur : "semua";
    }
    const range = window.activeRiwayatRange || "semua";
    document.querySelectorAll(".riwayat-range-btn").forEach((button) => {
      const active = button.dataset.riwayatRange === range;
      button.className = active
        ? "riwayat-range-btn rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white"
        : "riwayat-range-btn rounded-xl px-3 py-2 text-xs font-medium text-slate-200";
    });
    const search = (document.getElementById("riwayatSearch")?.value || "").trim().toLowerCase();
    const dateFrom = document.getElementById("riwayatDateFrom")?.value || "";
    const dateTo = document.getElementById("riwayatDateTo")?.value || "";
    const localDate = (value) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    };
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysBack = range === "7hari" ? 6 : range === "30hari" ? 29 : 0;
    const rangeStart = new Date(today);
    rangeStart.setDate(rangeStart.getDate() - daysBack);
    const rangeStartText = localDate(rangeStart);
    const todayText = localDate(today);
    const filtered = rows
      .filter((row) => filter === "semua" || row.status === filter)
      .filter((row) => selectedJalur === "semua" || row.jalur === selectedJalur)
      .filter((row) => {
        const emailText = `${row.email} ${row.depositId || ""} ${row.reason}`.toLowerCase();
        return !search || emailText.includes(search);
      })
      .filter((row) => {
        const dateText = localDate(row.createdAt);
        if (!dateText) return false;
        if (dateFrom && dateText < dateFrom) return false;
        if (dateTo && dateText > dateTo) return false;
        if (range === "hari" && dateText !== todayText) return false;
        if ((range === "7hari" || range === "30hari") && dateText < rangeStartText) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const heading = document.getElementById("riwayatResultHeading");
    if (heading) heading.textContent = `${statusLabels[filter] || "Semua"} (${filtered.length})`;
    if (!filtered.length) {
      const hasHistory = rows.length > 0;
      container.innerHTML = `<div class="riwayat-empty rounded-2xl border border-blue-100/80 bg-blue-100/80 px-4 py-10 text-center"><span class="riwayat-empty-icon mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-lg text-blue-500"><i class="fa-regular fa-folder-open"></i></span><p class="riwayat-empty-title mt-3 text-sm font-extrabold text-slate-100">${hasHistory ? "Tidak ada Gmail yang cocok" : "Belum ada riwayat Gmail"}</p><p class="riwayat-empty-description mt-1 text-xs text-slate-300">${hasHistory ? "Coba ubah kata kunci atau filter yang dipilih." : "Gmail yang kamu setor akan muncul di sini."}</p></div>`;
      return;
    }
    const formatDate = (value) => {
      if (!value) return "Menunggu pemeriksaan";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "Menunggu pemeriksaan";
      return new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).format(date);
    };
    container.innerHTML = filtered
      .map((row) => {
        const [label, badge, icon] = statusStyle[row.status];
        const details = `<a target="_top" href="/riwayat/${encodeURIComponent(row.transactionNumber || row.depositId || "")}" class="mt-1 inline-flex items-center gap-1 text-xs font-bold text-sky-300">Lihat proses <i class="fa-solid fa-chevron-right text-[9px]"></i></a>`;
        return `<article class="riwayat-card flex items-start justify-between gap-3 rounded-[22px] border border-blue-100/80 bg-blue-100/80 p-3.5 shadow-[0_7px_22px_rgba(59,130,246,0.08)]"><div class="min-w-0 flex-1"><p class="riwayat-email break-all font-mono text-[12px] font-semibold leading-relaxed text-slate-100">${escapeHtml(row.email)}</p><p class="riwayat-meta mt-1 text-[11px] leading-relaxed text-slate-300">Stor: ${escapeHtml(formatDate(row.createdAt))}</p><p class="riwayat-meta text-[11px] leading-relaxed text-slate-300">Verifikasi: ${escapeHtml(formatDate(row.verifiedAt))}</p></div><div class="flex w-[104px] shrink-0 flex-col items-end"><span class="inline-flex items-center gap-1 rounded-full ${badge} px-2.5 py-1 text-[11px] font-extrabold"><i class="fa-solid ${icon}"></i>${label}</span>${details}</div></article>`;
      })
      .join("");
  };
  const renderHistoryDetail = (depositId) => {
    const summary = document.getElementById("historyDetailSummary");
    const timeline = document.getElementById("historyDetailTimeline");
    if (!summary || !timeline) return;
    const deposit = state.deposits.find((item) => String(item.id) === String(depositId) || String(item.transaction_number || "") === String(depositId));
    if (!deposit) {
      summary.innerHTML = '<div class="text-sm font-semibold text-rose-600">Transaksi tidak ditemukan.</div>';
      timeline.innerHTML = "";
      return;
    }
    const emails = Array.isArray(deposit.emails) ? deposit.emails : [];
    const accepted = Array.isArray(deposit.accepted_emails) ? deposit.accepted_emails.length : 0;
    const status = String(deposit.status || "pending").toLowerCase();
    const rejected = status === "ditolak";
    const approved = status === "diterima";
    const rate = depositRateFor(deposit);
    const formatDate = (value) => {
      if (!value) return "Menunggu pemeriksaan";
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "Menunggu pemeriksaan" : new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date);
    };
    const route = String(deposit.jalur || "PW");
    const routePassword = route.toUpperCase() === "PW" ? String(state.settings?.campaign_password || "-") : "-";
    summary.innerHTML = `<div><p class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Gmail</p><p class="mt-1 break-all font-mono text-sm font-bold text-slate-800">${escapeHtml(emails.join(", ") || "-")}</p></div><div class="grid grid-cols-2 gap-3"><div class="rounded-2xl bg-sky-50 p-3"><p class="text-[11px] font-semibold text-slate-400">Jalur</p><p class="mt-1 text-sm font-extrabold text-slate-800">${escapeHtml(route)}</p><p class="mt-1 text-xs font-black text-slate-700">PW: ${escapeHtml(routePassword)} · ${format(rate)}</p></div><div class="rounded-2xl bg-sky-50 p-3"><p class="text-[11px] font-semibold text-slate-400">Tanggal Stor</p><p class="mt-1 text-xs font-bold text-slate-800">${formatDate(deposit.created_at)}</p></div></div><p class="text-[11px] text-slate-400">Nomor transaksi: <span class="font-mono">${escapeHtml(deposit.transaction_number || deposit.id)}</span></p>`;
    const steps = [
      { label: "Setoran Terkirim", detail: `Gmail berhasil dikirim ke sistem · ${formatDate(deposit.created_at)}` },
      { label: "Pending", detail: approved || rejected ? "Setoran telah diproses oleh admin." : "Menunggu untuk diproses oleh admin." },
      { label: approved ? "Disetujui" : rejected ? "Ditolak" : "Disetujui / Ditolak", detail: approved ? `Saldo ${format(deposit.earned || accepted * rate)} sudah ditambahkan.` : rejected ? `Alasan: ${deposit.reason || ""}` : "Keputusan admin belum dibuat." },
    ];
    const activeIndex = approved || rejected ? 2 : 1;
    timeline.innerHTML = steps.map((step, index) => {
      const completed = approved || index < activeIndex;
      const active = !completed && index === activeIndex;
      const color = rejected && index === 2 ? "bg-rose-600" : completed ? "bg-emerald-500" : active ? "bg-amber-400" : "bg-slate-300";
      const text = rejected && index === 2 ? "text-rose-700" : completed ? "text-slate-800" : active ? "text-amber-700" : "text-slate-400";
      const lineColor = rejected && index === 1 ? "bg-rose-300" : completed ? "bg-emerald-300" : "bg-slate-200";
      const line = index < steps.length - 1 ? `<span class="absolute left-1/2 top-8 h-9 w-0.5 -translate-x-1/2 ${lineColor}"></span>` : "";
      return `<div class="relative flex gap-3 pb-5"><div class="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${color} text-xs text-white shadow-sm"><i class="fa-solid ${rejected && index === 2 ? "fa-xmark" : completed ? "fa-check" : "fa-clock"}"></i></div><div class="min-w-0"><p class="text-sm font-extrabold ${text}">${step.label}</p><p class="mt-1 text-xs leading-relaxed text-slate-500">${step.detail}</p></div>${line}</div>`;
    }).join("");
  };
  window.renderRiwayatDetail = renderHistoryDetail;
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
  window.renderRiwayatFromDeposits = (deposits, filter = window.activeRiwayatFilter || "semua") =>
    renderHistory(filter, deposits);
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
    const [settingsResult, depositsResult, withdrawalsResult, generatedGmailsResult] =
      await Promise.allSettled([
        api("settings"),
        api("deposits"),
        api("withdrawals"),
        api("stock/generated"),
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
      const detailId = new URLSearchParams(location.search).get("nomortrx");
      if (new URLSearchParams(location.search).get("view") === "riwayat-detail" && detailId)
        renderHistoryDetail(detailId);
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
    if (generatedGmailsResult.status === "fulfilled") {
      replaceGeneratedStockGmails(generatedGmailsResult.value.gmails);
      clearGeneratedGmailError();
    } else {
      console.warn("Gagal memuat Gmail hasil generate:", generatedGmailsResult.reason);
      const detail = errorText(generatedGmailsResult.reason, "");
      const message = detail.includes("Gmail stok belum siap")
        ? detail
        : "Gagal mengambil Gmail stok. Silahkan Hubungi Admin.";
      showGeneratedGmailError(message);
      if (!generatedGmailLoadErrorActive) showToast("error", message);
      generatedGmailLoadErrorActive = true;
    }
    window.maybeShowInformationOverlay?.();
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
  window.selectDepositRoute = (route) => {
    if (depositSubmissionBusy) return;
    if (route !== "PW" && route !== "CAPTCHA") return;
    const enabled =
      route === "PW"
        ? state.settings?.pw_enabled !== false
        : state.settings?.captcha_enabled === true;
    if (!enabled) {
      showToast("warning", `⚠️ Jalur ${route} sedang dinonaktifkan admin.`);
      return;
    }
    selectedDepositRoute = route;
    applyUserDom();
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
    if (depositSubmissionBusy) return;
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
    const seenEmails = new Set();
    const duplicateEmails = new Set();
    emails.forEach((email) => {
      if (seenEmails.has(email)) duplicateEmails.add(email);
      seenEmails.add(email);
    });
    const previouslySubmitted = new Set(
      state.deposits
        .flatMap((deposit) => (Array.isArray(deposit.emails) ? deposit.emails : []))
        .map((email) => String(email).trim().toLowerCase()),
    );
    emails.forEach((email) => {
      if (previouslySubmitted.has(email)) duplicateEmails.add(email);
    });
    if (duplicateEmails.size) {
      const shown = [...duplicateEmails].slice(0, 5).join(", ");
      const remaining = duplicateEmails.size > 5 ? `, dan ${duplicateEmails.size - 5} lainnya` : "";
      showToast(
        "warning",
        `Gmail yang sama sudah pernah dikirim atau terduplikasi, jadi tidak dapat dikirim lagi: ${shown}${remaining}`,
      );
      return;
    }
    if (state.settings?.store_open === false) {
      const reason = String(state.settings.store_closed_reason || "").trim();
      showToast(
        "warning",
        reason
          ? `Setoran ditutup oleh admin. Alasan: ${reason}`
          : "⚠️ Setoran Gmail sedang ditutup oleh admin.",
      );
      return;
    }
    depositSubmissionBusy = true;
    applyUserDom();
    try {
      await api("deposits", {
        method: "POST",
        body: JSON.stringify({
          emails,
          jalur: selectedDepositRoute,
          campaignPassword: selectedDepositRoute === "PW" ? state.settings?.campaign_password : "",
        }),
      });
    } catch (error) {
      const duplicateConflict =
        error.status === 409 &&
        /sudah pernah dikirim|tidak dapat dikirim ulang|sudah diklaim|terduplikasi|yang sama tidak boleh dikirim/i.test(
          error.message || "",
        );
      const generatedMismatch =
        error.status === 422 && /Generated Gmail|otomatis ditolak|tidak sesuai/i.test(error.message || "");
      showToast(
        duplicateConflict || generatedMismatch ? "warning" : "error",
        duplicateConflict || generatedMismatch
          ? error.message
          : `Setoran Gmail gagal dikirim: ${errorText(error, "coba lagi nanti.")}`,
      );
      if (generatedMismatch) {
        showGeneratedGmailError(error.message);
        await refreshGeneratedStockGmails().catch((refreshError) =>
          console.error("Gagal memperbarui status Generated Gmail:", refreshError),
        );
        await syncAppData().catch((refreshError) =>
          console.error("Gagal memuat riwayat auto-tolak:", refreshError),
        );
      }
      return;
    } finally {
      depositSubmissionBusy = false;
      applyUserDom();
    }
    await refreshGeneratedStockGmails().catch((error) =>
      console.error("Gagal memperbarui status Gmail hasil generate:", error),
    );
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
  const syncStockGeneratorControls = () => {
    const mainButton = document.getElementById("generateStockGmailButton");
    const againButton = document.getElementById("generateStockGmailAgainButton");
    const generatorSection = document.getElementById("stockGeneratorSection");
    const progress = document.getElementById("stockGenerateProgress");
    const customInput = document.getElementById("customStockGenerateCount");
    const generatedPanel = document.getElementById("generatedGmailPanel");
    const generatorEnabled = state.settings?.auto_stock_enabled === true;
    if (generatorSection) generatorSection.classList.toggle("hidden", !generatorEnabled);
    document.querySelectorAll("[data-generate-only]").forEach((element) => {
      element.classList.toggle("hidden", !generatorEnabled);
    });
    const depositLabel = document.getElementById("depositGmailLabel");
    if (depositLabel)
      depositLabel.textContent = generatorEnabled
        ? "Tempel Gmail dari Generated Gmail (satu per baris)"
        : "Daftar Gmail (satu per baris)";
    const depositHint = document.getElementById("depositGmailHint");
    if (depositHint)
      depositHint.textContent = generatorEnabled
        ? "Wajib gunakan Gmail yang tampil di panel Generated Gmail."
        : "Generate mati: kamu dapat setor Gmail apa saja dengan Password Wajib.";
    const generateModeNotice = document.getElementById("generateModeNotice");
    if (generateModeNotice) {
      generateModeNotice.textContent = generatorEnabled
        ? "Generate Telah Aktif, Buat Terlebih Dahulu Di Generated Gmail Sebelum Setor!!"
        : "Generate Sedang Off Tunggu Admin Mengembalikan On Lagi";
      generateModeNotice.className = generatorEnabled
        ? "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-center text-[11px] font-extrabold leading-relaxed text-amber-800"
        : "rounded-xl border border-slate-300 bg-slate-100 px-3 py-2.5 text-center text-[11px] font-extrabold leading-relaxed text-slate-700";
    }
    document.querySelectorAll("[data-stock-count]").forEach((option) => {
      option.disabled = stockGenerateBusy;
    });
    if (customInput) customInput.disabled = stockGenerateBusy;
    if (mainButton) {
      mainButton.style.display = generatedStockGmails.length > 0 ? "none" : "flex";
      mainButton.disabled = stockGenerateBusy;
      mainButton
        .querySelector("span")
        ?.replaceChildren(
          document.createTextNode(stockGenerateBusy ? "Sedang generate…" : "Generate Gmail"),
        );
    }
    if (againButton) {
      againButton.style.display = generatedStockGmails.length > 0 ? "flex" : "none";
      againButton.disabled = stockGenerateBusy;
      againButton
        .querySelector("span")
        ?.replaceChildren(
          document.createTextNode(stockGenerateBusy ? "Sedang generate…" : "Generate Lagi"),
        );
    }
    if (generatedPanel)
      generatedPanel.style.display = generatorEnabled && generatedStockGmails.length > 0 ? "flex" : "none";
    if (progress) {
      if (stockGenerateBusy) {
        progress.textContent = "Mengambil maksimal 5 akun untuk batch ini…";
      } else if (stockGenerateTarget > 0 && stockGenerateCompleted < stockGenerateTarget) {
        progress.textContent = `Progres target: ${stockGenerateCompleted} dari ${stockGenerateTarget} akun. Tekan Generate Lagi untuk batch berikutnya.`;
      } else if (stockGenerateTarget > 0) {
        progress.textContent = `Target ${stockGenerateTarget} akun berhasil dipenuhi. Kamu bisa memulai batch baru kapan saja.`;
      } else {
        progress.textContent = "Pilih jumlah, lalu generate Gmail.";
      }
    }
  };
  const renderGeneratedStockGmails = () => {
    const panel = document.getElementById("generatedGmailPanel");
    const list = document.getElementById("generatedGmailList");
    const total = document.getElementById("generatedGmailTotal");
    const pending = document.getElementById("generatedGmailUndeposited");
    const undeposited = generatedStockGmails.filter(
      (item) => item.status === "belum_disetor",
    ).length;
    if (panel)
      panel.style.display =
        state.settings?.auto_stock_enabled === true && generatedStockGmails.length > 0
          ? "flex"
          : "none";
    if (total) total.textContent = String(generatedStockGmails.length);
    if (pending) pending.textContent = String(undeposited);
    const statusPresentation = {
      belum_disetor: {
        label: "Belum disetor",
        classes: "border-slate-200 bg-white text-slate-600",
      },
      diproses: {
        label: "Diproses",
        classes: "border-amber-200 bg-amber-50 text-amber-700",
      },
      berhasil: {
        label: "Berhasil",
        classes: "border-emerald-200 bg-emerald-50 text-emerald-700",
      },
      ditolak: {
        label: "Ditolak",
        classes: "border-rose-200 bg-rose-50 text-rose-700",
      },
    };
    if (list) {
      list.innerHTML = generatedStockGmails
        .map((item, index) => {
          const status = statusPresentation[item.status] || statusPresentation.belum_disetor;
          return `
            <div class="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-100 px-2.5 py-2" role="listitem">
              <button type="button" onclick="copyGeneratedStockGmail(${index})" class="min-w-0 flex-1 flex items-center gap-2 text-left" aria-label="Salin ${escapeHtml(item.gmail)}">
                <i class="fa-regular fa-copy text-slate-500 shrink-0"></i>
                <span class="truncate font-mono text-xs text-slate-700">${escapeHtml(item.gmail)}</span>
              </button>
              <span class="shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${status.classes}">${status.label}</span>
              <button type="button" onclick="removeGeneratedStockGmail(${index})" class="h-8 w-8 shrink-0 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600" aria-label="Hapus ${escapeHtml(item.gmail)} dari daftar"><i class="fa-regular fa-trash-can"></i></button>
            </div>`;
        })
        .join("");
    }
    syncStockGeneratorControls();
  };
  const replaceGeneratedStockGmails = (rows) => {
    const items = Array.isArray(rows)
      ? rows
          .filter((item) => item && item.id && item.gmail)
          .map((item) => ({
            id: String(item.id),
            gmail: String(item.gmail),
            created_at: item.created_at,
            deposit_id: item.deposit_id || null,
            status: ["belum_disetor", "diproses", "berhasil", "ditolak"].includes(item.status)
              ? item.status
              : "belum_disetor",
          }))
      : [];
    generatedStockGmails.splice(0, generatedStockGmails.length, ...items);
    renderGeneratedStockGmails();
  };
  const refreshGeneratedStockGmails = async () => {
    const result = await api("stock/generated");
    replaceGeneratedStockGmails(result.gmails);
    return generatedStockGmails;
  };
  const copyGeneratedText = async (value) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const field = document.createElement("textarea");
    field.value = value;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    if (!copied) throw new Error("Clipboard tidak tersedia");
  };
  window.selectStockGenerateCount = (count, button) => {
    const quantity = Number(count);
    if (!Number.isSafeInteger(quantity) || quantity < 1) return;
    selectedStockGenerateCount = quantity;
    stockGenerateTarget = quantity;
    stockGenerateCompleted = 0;
    const customInput = document.getElementById("customStockGenerateCount");
    if (customInput) customInput.value = "";
    document.querySelectorAll("[data-stock-count]").forEach((option) => {
      option.classList.toggle("stock-count-option-active", option === button);
    });
    syncStockGeneratorControls();
  };
  window.updateStockGenerateCustom = (value) => {
    document.querySelectorAll("[data-stock-count]").forEach((option) => {
      option.classList.remove("stock-count-option-active");
    });
    const quantity = Number(value);
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      stockGenerateTarget = 0;
      stockGenerateCompleted = 0;
      syncStockGeneratorControls();
      return;
    }
    selectedStockGenerateCount = quantity;
    stockGenerateTarget = quantity;
    stockGenerateCompleted = 0;
    syncStockGeneratorControls();
  };
  window.copyGeneratedStockGmail = async (index) => {
    const item = generatedStockGmails[index];
    if (!item) return;
    try {
      await copyGeneratedText(item.gmail);
      showToast("success", "Gmail berhasil disalin.");
    } catch {
      showToast("error", "Gagal menyalin Gmail. Silakan salin secara manual.");
    }
  };
  window.removeGeneratedStockGmail = async (index) => {
    const item = generatedStockGmails[index];
    if (!item) return;
    try {
      await api(`stock/generated/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      await refreshGeneratedStockGmails();
      showToast("success", "Gmail diarsipkan dari daftar. Akun tidak dikembalikan ke stok.");
    } catch (error) {
      showToast("error", `Gagal mengarsipkan Gmail: ${errorText(error, "coba lagi nanti.")}`);
    }
  };
  window.copyAllGeneratedStockGmails = async () => {
    const value = generatedStockGmails.map((item) => item.gmail).join("\n");
    if (!value) return showToast("warning", "Belum ada Gmail untuk disalin.");
    try {
      await copyGeneratedText(value);
      showToast("success", `${generatedStockGmails.length} Gmail berhasil disalin.`);
    } catch {
      showToast("error", "Gagal menyalin Gmail. Silakan coba lagi.");
    }
  };
  window.copyUndepositedStockGmails = async () => {
    const items = generatedStockGmails.filter((item) => item.status === "belum_disetor");
    const value = items.map((item) => item.gmail).join("\n");
    if (!value) return showToast("warning", "Tidak ada Gmail yang belum disetor.");
    try {
      await copyGeneratedText(value);
      showToast("success", `${items.length} Gmail belum disetor berhasil disalin.`);
    } catch {
      showToast("error", "Gagal menyalin Gmail. Silakan coba lagi.");
    }
  };
  window.generateStockGmail = async () => {
    if (stockGenerateBusy) return;
    const customValue = document.getElementById("customStockGenerateCount")?.value.trim();
    const requested = customValue ? Number(customValue) : selectedStockGenerateCount;
    if (!Number.isSafeInteger(requested) || requested < 1) {
      showToast("warning", "Masukkan jumlah akun berupa bilangan bulat minimal 1.");
      return;
    }
    if (stockGenerateTarget !== requested || stockGenerateCompleted >= stockGenerateTarget) {
      stockGenerateTarget = requested;
      stockGenerateCompleted = 0;
    }
    const batchCount = Math.min(5, stockGenerateTarget - stockGenerateCompleted);
    stockGenerateBusy = true;
    syncStockGeneratorControls();
    try {
      const result = await api("stock/claim", {
        method: "POST",
        body: JSON.stringify({ count: batchCount }),
      });
      const gmails = Array.isArray(result.gmails)
        ? result.gmails
        : result.gmail
          ? [result.gmail]
          : [];
      if (!gmails.length) throw new Error("Server tidak mengirim daftar Gmail.");
      stockGenerateCompleted += gmails.length;
      await refreshGeneratedStockGmails();
      clearGeneratedGmailError();
      showToast(
        "success",
        `${gmails.length} Gmail berhasil dibuat di panel Generated Gmail (batch maksimal 5).${stockGenerateCompleted < stockGenerateTarget ? " Tekan Generate Lagi untuk melanjutkan target." : ""}`,
      );
    } catch (error) {
      const message =
        error?.status === 409 && String(error.message || "").includes("Stok Gmail")
          ? "Stok Gmail sedang kosong. Jika seharusnya tersedia, Silahkan Hubungi Admin."
          : "Gagal mengambil Gmail stok. Silahkan Hubungi Admin.";
      showGeneratedGmailError(message);
      generatedGmailLoadErrorActive = true;
      showToast("error", message);
    } finally {
      stockGenerateBusy = false;
      syncStockGeneratorControls();
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
    if (fee >= amount) {
      showToast("warning", "⚠️ Fee harus lebih kecil daripada nominal penarikan.");
      return;
    }
    if (amount > balance) {
      showToast("warning", "⚠️ Saldo tidak cukup untuk nominal penarikan.");
      return;
    }
    const modalBody = document.getElementById("modalBody");
    const modalTitle = document.getElementById("modalTitle");
    const modal = document.getElementById("appModal");
    if (!modalBody || !modalTitle || !modal) return;
    modalTitle.textContent = "Konfirmasi Tarik";
    const netAmount = amount - fee;
    modalBody.innerHTML = `<div class="space-y-2 text-xs"><div class="flex justify-between"><span>Metode payment</span><b>${escapeHtml(bank)}</b></div><div class="flex justify-between"><span>Nomor payment</span><b>${escapeHtml(number)}</b></div><div class="flex justify-between"><span>Nama pemilik</span><b>${escapeHtml(wallet.name)}</b></div><div class="flex justify-between"><span>Nominal penarikan</span><b>${format(amount)}</b></div><div class="flex justify-between"><span>Fee payment</span><b>−${format(fee)}</b></div><div class="flex justify-between border-t pt-2"><span>Total saldo terpotong</span><b>${format(amount)}</b></div><div class="flex justify-between"><span>Saldo bersih diterima</span><b>${format(netAmount)}</b></div><div class="rounded-xl bg-slate-100 p-3 text-slate-600">Pastikan nomor payment sudah benar. Jika Nomor Salah/Tidak Sesuai Dengan Nomor Payment Anda Admin Tidak Berhak Bertanggung Jawab.</div><div class="flex gap-2 pt-2"><button type="button" class="flex-1 rounded-xl border border-slate-200 px-3 py-2 font-bold" onclick="closeModal()">Kembali/Edit Nomor</button><button type="button" class="flex-1 rounded-xl bg-blue-600 px-3 py-2 font-bold text-white" id="confirmWithdrawalButton">Konfirmasi Tarik</button></div></div>`;
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
      setTimeout(() => window.top.location.assign("/auth"), 350);
    } catch (error) {
      console.error("Logout Error:", error);
      showToast("error", `Logout gagal: ${errorText(error, "periksa koneksi lalu coba lagi.")}`);
    }
  };
  window.addEventListener("DOMContentLoaded", async () => {
    const loadingScreen = document.getElementById("appLoadingScreen");
    const finishInitialLoad = () => {
      loadingScreen?.classList.add("hidden");
      if (window.parent !== window)
        window.parent.postMessage({ type: "tachi-app-ready" }, window.location.origin);
    };
    try {
      const { user } = await api("auth/me");
      const requestedView = new URLSearchParams(location.search).get("view");
      if (user) {
        applyIdentityToDom(user);
        const availableViews = ["dashboard", "stor", "saldo", "profil", "riwayat", "riwayat-detail"];
        const initialView = availableViews.includes(requestedView) ? requestedView : "dashboard";
        window.navigateTo?.(initialView);
        await syncAppData();
        finishInitialLoad();
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
        window.top.location.replace("/auth");
        return;
      } else {
        finishInitialLoad();
      }
    } catch (error) {
      console.error("Gagal memuat sesi akun:", error);
      showToast("error", `Gagal memuat sesi akun: ${errorText(error, "server tidak merespons.")}`);
      finishInitialLoad();
    }
  });
})();
