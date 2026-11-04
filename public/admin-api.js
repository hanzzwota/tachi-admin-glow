(() => {
  // Melempar Error bila jaringan gagal, HTTP bukan 2xx, atau backend mengirim `error`.
  // Toast success hanya boleh muncul setelah `await api(...)` selesai tanpa error.
  const api = async (path, options = {}) => {
    let response;
    try {
      response = await fetch(`/api/${path}`, {
        credentials: "include",
        ...options,
        headers: { "content-type": "application/json", ...(options.headers || {}) },
      });
    } catch (cause) {
      console.error(`[admin-api] Fetch Error /api/${path}:`, cause);
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
  // Aksi utama sudah sukses; kalau hanya memuat ulang tabel yang gagal -> warning, bukan error aksi.
  const refreshAfterAction = async () => {
    try {
      await refresh();
    } catch (error) {
      console.error("Gagal memuat ulang data admin:", error);
      showToast("warning", "⚠️ Perubahan tersimpan, tetapi tabel belum ter-update. Muat ulang halaman.");
    }
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
  const normalizeSupportChannels = (value) => {
    const legacyWhatsApp = Array.isArray(value?.whatsapp) ? value.whatsapp : [];
    const legacyTelegram = Array.isArray(value?.telegram) ? value.telegram : [];
    const source = Array.isArray(value?.admins) ? value.admins : [];
    return {
      whatsappEnabled: value?.whatsappEnabled !== false && value?.whatsapp_enabled !== false,
      telegramEnabled: value?.telegramEnabled !== false && value?.telegram_enabled !== false,
      admins: [0, 1].map((index) => ({
        name: source[index]?.name || `Admin ${index + 1}`,
        whatsapp: source[index]?.whatsapp || legacyWhatsApp[index] || "",
        telegram: source[index]?.telegram || legacyTelegram[index] || "",
        enabled: source[index]?.enabled !== false,
      })),
    };
  };
  const readSupportChannels = () => ({
    whatsappEnabled: document.getElementById("supportWhatsappToggle")?.dataset.enabled !== "false",
    telegramEnabled: document.getElementById("supportTelegramToggle")?.dataset.enabled !== "false",
    admins: [1, 2].map((index) => ({
      name: document.getElementById(`supportAdmin${index}Name`).value.trim() || `Admin ${index}`,
      whatsapp: document.getElementById(`supportAdmin${index}Whatsapp`).value.trim(),
      telegram: document.getElementById(`supportAdmin${index}Telegram`).value.trim(),
      enabled: document.getElementById(`supportAdmin${index}Enabled`)?.dataset.enabled !== "false",
    })),
  });
  const normalize = (settings, deposits, users, withdrawals, assignedGmails = [], paymentFeesOverride = null) => ({
    settings: {
      rate: Number(settings?.rate || 0),
      pwRate: Number(settings?.pw_rate ?? settings?.rate ?? 0),
      captchaRate: Number(settings?.captcha_rate ?? settings?.rate ?? 0),
      minTarik: Math.max(FIXED_MIN_WITHDRAWAL, Number(settings?.min_withdrawal || 0)),
      paymentMode: settings?.payment_mode === "dana_only" ? "dana_only" : "all",
      fee: normalizeFee(settings?.fee),
      paymentFees: normalizePaymentFees(
        paymentFeesOverride ?? settings?.payment_fees,
        Number(settings?.fee || 0),
      ),
      campaignPass: settings?.campaign_password || "",
      pwLabel: settings?.pw_text || "PW",
      pwOpen: settings?.pw_enabled !== false,
      captchaOpen: settings?.captcha_enabled === true,
      captchaText: settings?.captcha_text || "CAPTCHA",
      storOpen: settings?.store_open !== false,
      tarikOpen: settings?.withdraw_open !== false,
      checkerOpen: settings?.checker_open !== false,
      dailyMax: Number(settings?.daily_limit || 0),
      limit: Number(settings?.batch_limit || 0),
      announcement: settings?.announcement || "",
      storeClosedReason: settings?.store_closed_reason || "",
      rulesText:
        settings?.rules_text ||
        "1. Gmail harus fresh.\n2. Wajib menggunakan password yang dicantumkan di bawah.\n3. Keputusan admin tachi69gmail mutlak.",
      supportChannels: normalizeSupportChannels(settings?.support_channels),
      autoStockEnabled: settings?.auto_stock_enabled === true,
      gmailStock: Array.isArray(settings?.gmail_stock) ? settings.gmail_stock : [],
    },
    setoran: Array.isArray(deposits)
      ? deposits.map((item) => {
          const acceptedEmails = Array.isArray(item.accepted_emails) ? item.accepted_emails : [];
          const rejectedEmails = Array.isArray(item.rejected_emails) ? item.rejected_emails : [];
          const acceptedCount = Number(item.accepted_count);
          const earned = Number(item.earned);
          const createdAt = Date.parse(item.created_at || "");
          const verifiedAt = item.verified_at ? Date.parse(item.verified_at) : Number.NaN;
          return {
            ...item,
            id: item.id,
            date: Number.isFinite(createdAt) ? createdAt : 0,
            verifiedAt: Number.isFinite(verifiedAt) ? verifiedAt : null,
            accepted: Number.isFinite(acceptedCount)
              ? Math.max(0, acceptedCount, acceptedEmails.length)
              : acceptedEmails.length,
            earned: Number.isFinite(earned) ? Math.max(0, earned) : 0,
            accepted_emails: acceptedEmails,
            rejected_emails: rejectedEmails,
            user: item.profiles?.username || item.user_id,
            emails: Array.isArray(item.emails) ? item.emails : [],
          };
        })
      : [],
    users: Array.isArray(users)
      ? users.map((item) => ({
          ...item,
          username: item.username,
          saldo: Number(item.balance || 0),
          withdrawn: Number(item.withdrawn || 0),
          id: item.id,
          blocked: item.is_blocked === true,
          wallet: { name: item.wallet_name || "", dana: item.wallet_number || "" },
          vip: false,
        }))
      : [],
    withdrawals: Array.isArray(withdrawals)
      ? withdrawals.map((item) => ({
          ...item,
          id: item.id,
          date: new Date(item.created_at).getTime(),
          user: item.profiles?.username || item.user_id,
          name: item.wallet_name,
          dana: item.wallet_number,
          amount: Number(item.amount || 0),
          fee: Number(item.fee || 0),
        }))
      : [],
    assignedGmails: Array.isArray(assignedGmails)
      ? assignedGmails.map((item) => ({
          id: item.id,
          gmail: item.gmail,
          username: item.username || item.user_id || "-",
          displayName: item.display_name || "",
          createdAt: item.created_at,
          archivedAt: item.archived_at,
        }))
      : [],
    daily: {
      date: new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10),
      count: Number(settings?.daily_used || 0),
    },
  });
  const wibDate = (value = Date.now()) =>
    new Date(new Date(value).getTime() + 7 * 3600e3).toISOString().slice(0, 10);
  let recapDate = wibDate();
  const dailyDeposits = () => {
    return db.setoran.filter((item) => {
      const timestamp = new Date(item.created_at || item.date).getTime();
      return wibDate(timestamp) === recapDate;
    });
  };
  window.setRecapDate = (value) => {
    recapDate =
      value === "today"
        ? wibDate()
        : value === "yesterday"
          ? wibDate(Date.now() - 86400000)
          : value;
    const input = document.getElementById("recapDate");
    if (input) input.value = recapDate;
    window.renderDailyRecap?.();
  };
  window.renderDailyRecap = () => {
    const rows = dailyDeposits().sort((a, b) => Number(b.date || 0) - Number(a.date || 0));
    const statusByEmail = new Map();
    rows.forEach((item) => {
      const accepted = new Set(
        (Array.isArray(item.accepted_emails) ? item.accepted_emails : []).map((email) =>
          String(email).trim().toLowerCase(),
        ),
      );
      const rejected = new Set(
        (Array.isArray(item.rejected_emails) ? item.rejected_emails : []).map((email) =>
          String(email).trim().toLowerCase(),
        ),
      );
      (Array.isArray(item.emails) ? item.emails : []).forEach((rawEmail) => {
        const email = String(rawEmail).trim();
        const key = email.toLowerCase();
        if (!key || statusByEmail.has(key)) return;
        let status = "pending";
        if (accepted.has(key) || (item.status === "diterima" && !rejected.has(key)))
          status = "diterima";
        else if (rejected.has(key) || item.status === "ditolak") status = "ditolak";
        statusByEmail.set(key, { email, status });
      });
    });
    const classifiedEmails = [...statusByEmail.values()];
    const pendingEmails = classifiedEmails
      .filter((item) => item.status === "pending")
      .map((item) => item.email);
    const acceptedEmails = classifiedEmails
      .filter((item) => item.status === "diterima")
      .map((item) => item.email);
    const rejectedCount = classifiedEmails.filter((item) => item.status === "ditolak").length;
    const stats = document.getElementById("dailyRecapStats");
    const pendingText = document.getElementById("dailyPendingGmailText");
    const acceptedText = document.getElementById("dailyAcceptedGmailText");
    if (stats)
      stats.innerHTML = [
        `${recapDate} · ${rows.length} transaksi`,
        `${classifiedEmails.length} Gmail unik`,
        `${acceptedEmails.length} diterima`,
        `${pendingEmails.length} pending`,
        `${rejectedCount} ditolak`,
      ]
        .map(
          (value) =>
            `<div class="rounded-xl border border-blue-50 bg-white p-3 text-center text-sm font-extrabold text-blue-700">${value}</div>`,
        )
        .join("");
    if (pendingText) pendingText.value = pendingEmails.join("\n");
    if (acceptedText) acceptedText.value = acceptedEmails.join("\n");
  };
  window.copyDailyGmail = async (status) => {
    const isPending = status === "pending";
    const value =
      document.getElementById(isPending ? "dailyPendingGmailText" : "dailyAcceptedGmailText")
        ?.value || "";
    const label = isPending ? "pending" : "berhasil diterima";
    if (!value) return showToast("warning", `Belum ada Gmail ${label} untuk disalin.`);
    try {
      await navigator.clipboard.writeText(value);
      showToast(
        "success",
        `${value.split("\n").filter(Boolean).length} Gmail ${label} berhasil disalin!`,
      );
    } catch (error) {
      console.error("Copy Error:", error);
      showToast("error", "Gagal menyalin Gmail rekapan. Tidak ada izin akses clipboard.");
    }
  };
  window.exportDailyGmail = () => {
    const pending = document.getElementById("dailyPendingGmailText")?.value || "";
    const accepted = document.getElementById("dailyAcceptedGmailText")?.value || "";
    if (!pending && !accepted)
      return showToast("warning", "Belum ada Gmail pending atau berhasil untuk diekspor.");
    const stamp = recapDate;
    const value = `Rekapan Gmail Setoran ${stamp}\n\nGMAIL PENDING\n${pending || "-"}\n\nGMAIL BERHASIL DITERIMA\n${accepted || "-"}\n`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([value], {
        type: "text/plain;charset=utf-8",
      }),
    );
    link.download = `rekapan-gmail-${stamp}.txt`;
    try {
      link.click();
      showToast("success", `File rekapan Gmail ${stamp} berhasil diekspor!`);
    } catch (error) {
      console.error("Export Error:", error);
      showToast("error", "Gagal mengekspor file rekapan Gmail.");
    } finally {
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }
  };
  let refreshInFlight = null;
  const refresh = async (paymentFeesOverride = null) => {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      const [{ deposits }, { users }, { settings }, { withdrawals }, { gmails }] = await Promise.all([
        api("admin/deposits"),
        api("admin/users"),
        api("settings"),
        api("admin/withdrawals"),
        api("admin/stock/assigned"),
      ]);
      db = normalize(settings, deposits, users, withdrawals, gmails, paymentFeesOverride);
      ["DANA", "OVO", "GoPay", "ShopeePay", "BCA", "BRI", "Mandiri"].forEach((key) => {
        const input = document.getElementById(`fee${key}`);
        if (input) input.value = Number(db.settings.paymentFees[key] || 0);
      });
      window.reloadAdminDb?.();
    })();
    try {
      return await refreshInFlight;
    } finally {
      refreshInFlight = null;
    }
  };
  const refreshPayoutData = async () => {
    if (refreshInFlight) await refreshInFlight.catch(() => {});
    const [{ withdrawals }, { users }] = await Promise.all([
      api("admin/withdrawals"),
      api("admin/users"),
    ]);
    const refreshed = normalize({}, [], users, withdrawals, db.assignedGmails);
    db.withdrawals = refreshed.withdrawals;
    db.users = refreshed.users;
    db.assignedGmails = refreshed.assignedGmails;
    window.reloadAdminDb?.();
  };
  const finishWithdrawalAction = (id, status, reason = "") => {
    const withdrawal = db.withdrawals.find((item) => String(item.id) === String(id));
    if (withdrawal) {
      withdrawal.status = status;
      if (reason) withdrawal.reason = reason;
    }
    window.reloadAdminDb?.();
    void refreshPayoutData().catch((error) => {
      console.error("Gagal menyegarkan data penarikan:", error);
    });
  };
  const settingsPayload = (overrides = {}) => ({
    rate: db.settings.pwRate,
    pwRate: db.settings.pwRate,
    captchaRate: db.settings.captchaRate,
    minWithdrawal: db.settings.minTarik,
    paymentMode: db.settings.paymentMode,
    fee: db.settings.fee,
    paymentFees: db.settings.paymentFees,
    campaignPassword: db.settings.campaignPass,
    pwText: db.settings.pwLabel,
    pwEnabled: db.settings.pwOpen,
    captchaEnabled: db.settings.captchaOpen,
    captchaText: db.settings.captchaText,
    storeOpen: db.settings.storOpen,
    storeClosedReason: db.settings.storeClosedReason,
    withdrawOpen: db.settings.tarikOpen,
    checkerOpen: db.settings.checkerOpen,
    dailyLimit: db.settings.dailyMax,
    batchLimit: db.settings.limit,
    announcement: db.settings.announcement,
    rulesText: db.settings.rulesText,
    supportChannels: db.settings.supportChannels,
    autoStockEnabled: db.settings.autoStockEnabled,
    gmailStock: db.settings.gmailStock,
    ...overrides,
  });
  window.persistSettings = async () => {
    try {
      await api("admin/settings", {
        method: "PATCH",
        body: JSON.stringify(settingsPayload()),
      });
    } catch (error) {
      showToast("error", `Gagal memperbarui status fitur: ${errorText(error, "coba lagi nanti.")}`);
      return false;
    }
    showToast("success", "Status fitur berhasil diperbarui!");
    await refreshAfterAction();
    return true;
  };
  // Sakelar Buka/Tutup fitur: toast baru muncul setelah server menjawab.
  window.toggleFeature = async (key, label) => {
    if (!db?.settings || !(key in db.settings)) {
      showToast("warning", "⚠️ Data pengaturan belum termuat. Muat ulang halaman.");
      return;
    }
    const previous = db.settings[key];
    const previousClosedReason = db.settings.storeClosedReason;
    const next = !previous;
    db.settings[key] = next;
    if (key === "storOpen" && next) db.settings.storeClosedReason = "";
    try {
      await api("admin/settings", {
        method: "PATCH",
        body: JSON.stringify(settingsPayload()),
      });
    } catch (error) {
      db.settings[key] = previous; // kembalikan tampilan ke kondisi sebenarnya
      db.settings.storeClosedReason = previousClosedReason;
      window.reloadAdminDb?.();
      showToast("error", `Gagal ${next ? "membuka" : "menutup"} ${label}: ${errorText(error, "coba lagi nanti.")}`);
      return;
    }
    showToast("success", `${label} berhasil ${next ? "dibuka" : "ditutup"}!`);
    await refreshAfterAction();
  };
  window.saveStoreClosedReason = async () => {
    if (db.settings?.storOpen !== false) {
      showToast("warning", "Tutup setor terlebih dahulu untuk mengatur alasan penutupan.");
      return;
    }
    const input = document.getElementById("storeClosedReasonInput");
    const previous = db.settings.storeClosedReason;
    db.settings.storeClosedReason = String(input?.value || "")
      .trim()
      .slice(0, 300);
    try {
      await api("admin/settings", {
        method: "PATCH",
        body: JSON.stringify(settingsPayload()),
      });
    } catch (error) {
      db.settings.storeClosedReason = previous;
      showToast("error", `Alasan gagal disimpan: ${errorText(error, "coba lagi nanti.")}`);
      return;
    }
    showToast("success", "Alasan penutupan setor berhasil disimpan.");
    await refreshAfterAction();
  };
  window.doLogin = async (event) => {
    event.preventDefault();
    lerr.textContent = "Memvalidasi akun…";
    lerr.classList.remove("hidden");
    try {
      const result = await api("auth/login", {
        method: "POST",
        body: JSON.stringify({ username: lu.value.trim(), password: lp.value }),
      });
      if (!result?.user?.id) throw new Error("Login gagal! Server tidak mengembalikan sesi login. 😟");
      if (result.user.role !== "admin") {
        lerr.textContent = "Akun ini bukan admin.";
        showToast("error", "Login gagal! Akun ini tidak memiliki akses admin.");
        return;
      }
      lerr.classList.add("hidden");
      showToast("success", "Login admin berhasil! Selamat datang. 🚀");
      await refreshAfterAction();
      showApp();
    } catch (error) {
      console.error("Admin Login Error:", error);
      const message = error.isNetworkError
        ? "Koneksi gagal! Silakan periksa jaringan Anda atau coba lagi nanti."
        : error.status >= 500
          ? "Terjadi kesalahan sistem saat mencoba login. Coba lagi nanti."
          : error.message || "Login gagal! Username atau password salah. 😟";
      lerr.textContent = message;
      showToast("error", message);
    }
  };
  const setDepositActionProcessing = (isProcessing) => {
    const button = document.getElementById("depositActionConfirmButton");
    if (!button) return;
    button.disabled = isProcessing;
    button.setAttribute("aria-busy", String(isProcessing));
    button.innerHTML = isProcessing
      ? '<i class="fa fa-spinner fa-spin mr-2" aria-hidden="true"></i><span>Memproses setoran…</span>'
      : button.dataset.idleLabel || "Proses Setoran";
  };
  window.doAcc = async (id) => {
    const confirmButton = document.getElementById("depositActionConfirmButton");
    if (confirmButton?.disabled) return;
    let acceptedEmails;
    try {
      acceptedEmails = [
        ...document.querySelectorAll("input[name='acceptedEmail']:checked"),
      ].map((input) => input.value);
      if (!acceptedEmails.length) {
        showToast("warning", "⚠️ Centang minimal 1 Gmail yang ingin diterima!");
        return;
      }
      setDepositActionProcessing(true);
      await api(`admin/deposits/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({ acceptedEmails }),
      });
    } catch (error) {
      setDepositActionProcessing(false);
      showToast("error", `Gagal menerima setoran: ${errorText(error, "coba lagi nanti.")}`);
      return;
    }
    closeModal();
    showToast("success", "Setoran berhasil diterima dan saldo user diperbarui!");
    await refreshAfterAction();
  };
  window.doRej = async (id) => {
    const confirmButton = document.getElementById("depositActionConfirmButton");
    if (confirmButton?.disabled) return;
    try {
      const type = document.getElementById("rType")?.value || "Lainnya";
      const detail = document.getElementById("rCustom")?.value.trim() || "";
      if (type === "Lainnya" && !detail) {
        showToast("warning", "⚠️ Tulis alasan penolakan sendiri!");
        return;
      }
      const reason = type === "Lainnya" ? detail : detail ? `${type}: ${detail}` : type;
      const rejectedEmails = [
        ...document.querySelectorAll("input[name='rejectedEmail']:checked"),
      ].map((input) => input.value);
      if (!rejectedEmails.length) {
        showToast("warning", "⚠️ Centang minimal 1 Gmail yang ingin ditolak!");
        return;
      }
      setDepositActionProcessing(true);
      await api(`admin/deposits/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason, rejectedEmails }),
      });
    } catch (error) {
      setDepositActionProcessing(false);
      showToast("error", `Gagal menolak setoran: ${errorText(error, "coba lagi nanti.")}`);
      return;
    }
    closeModal();
    showToast("success", "Setoran berhasil ditolak dan alasan tersimpan.");
    await refreshAfterAction();
  };
  const bulkGmails = (id) => [...new Set(String(document.getElementById(id)?.value || "").split(/[\s,]+/).map((value) => value.trim().toLowerCase()).filter(Boolean))];
  const bulkDepositIdsFromGmails = (gmails) => {
    const wanted = new Set(gmails);
    const matched = new Map();
    (Array.isArray(db?.setoran) ? db.setoran : []).forEach((deposit) => {
      if (deposit.status !== "pending") return;
      const found = (Array.isArray(deposit.emails) ? deposit.emails : []).some((email) => wanted.has(String(email).trim().toLowerCase()));
      if (found) matched.set(String(deposit.id), deposit);
    });
    return [...matched.keys()];
  };
  const setBulkStatus = (message, tone = "text-violet-800") => {
    const status = document.getElementById("bulkActionStatus");
    if (!status) return;
    status.textContent = message;
    status.className = `mt-2 text-xs font-bold ${tone}`;
  };
  const runBulk = async (ids, action) => {
    let success = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await api(`admin/deposits/${encodeURIComponent(id)}/${action.path}`, {
          method: "POST",
          body: JSON.stringify(action.body || {}),
        });
        success += 1;
      } catch (error) {
        failed += 1;
        console.warn(`Bulk ${action.path} gagal untuk ${id}:`, error);
      }
      setBulkStatus(`Memproses ${success + failed}/${ids.length} transaksi…`);
    }
    await refreshAfterAction();
    return { success, failed };
  };
  window.bulkApproveDeposits = async () => {
    const gmails = bulkGmails("bulkApproveIds");
    if (!gmails.length) return showToast("warning", "⚠️ Masukkan minimal satu Gmail untuk Bulk Setuju.");
    const ids = bulkDepositIdsFromGmails(gmails);
    if (!ids.length) return showToast("warning", "⚠️ Tidak ada Gmail yang cocok dengan setoran pending.");
    if (!window.confirm(`Setujui ${gmails.length} Gmail pada ${ids.length} setoran pending?`)) return;
    setBulkStatus(`Memproses 0/${ids.length} setoran…`);
    const result = await runBulk(ids, { path: "approve" });
    setBulkStatus(`Selesai: ${result.success} berhasil, ${result.failed} gagal.`, result.failed ? "text-amber-800" : "text-green-700");
    showToast(result.failed ? "warning" : "success", `Bulk setuju selesai: ${result.success} berhasil, ${result.failed} gagal.`);
  };
  window.bulkRejectDeposits = async () => {
    const gmails = bulkGmails("bulkRejectIds");
    if (!gmails.length) return showToast("warning", "⚠️ Masukkan minimal satu Gmail untuk Bulk Tolak.");
    const ids = bulkDepositIdsFromGmails(gmails);
    if (!ids.length) return showToast("warning", "⚠️ Tidak ada Gmail yang cocok dengan setoran pending.");
    const type = document.getElementById("bulkRejectReasonType")?.value || "Lainnya";
    const detail = document.getElementById("bulkRejectReason")?.value.trim() || "";
    if (type === "Lainnya" && !detail) return showToast("warning", "⚠️ Tulis alasan penolakan sendiri.");
    const reason = type === "Lainnya" ? detail : detail ? `${type}: ${detail}` : type;
    if (!window.confirm(`Tolak Gmail dari ${ids.length} setoran dengan alasan "${reason}"?`)) return;
    setBulkStatus(`Memproses 0/${ids.length} setoran…`);
    const result = await runBulk(ids, { path: "reject", body: { reason } });
    setBulkStatus(`Selesai: ${result.success} berhasil, ${result.failed} gagal.`, result.failed ? "text-amber-800" : "text-green-700");
    showToast(result.failed ? "warning" : "success", `Bulk tolak selesai: ${result.success} berhasil, ${result.failed} gagal.`);
  };
  window.accWd = async (id) => {
    try {
      await api(`admin/withdrawals/${id}/approve`, { method: "POST" });
    } catch (error) {
      showToast("error", `Gagal menyelesaikan pencairan: ${errorText(error, "coba lagi nanti.")}`);
      return;
    }
    finishWithdrawalAction(id, "selesai");
    showToast("success", "Pencairan saldo berhasil ditandai selesai!");
  };
  window.rejWd = async (id) => {
    const reason = document.getElementById("wdR")?.value.trim();
    if (!reason) return showToast("warning", "⚠️ Alasan penolakan penarikan wajib diisi!");
    try {
      await api(`admin/withdrawals/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    } catch (error) {
      showToast("error", `Gagal menolak penarikan: ${errorText(error, "coba lagi nanti.")}`);
      return;
    }
    closeModal();
    finishWithdrawalAction(id, "ditolak", reason);
    showToast("success", "Penarikan berhasil ditolak dan saldo dikembalikan ke user.");
  };
  const userActionText = {
    delete: { ok: "Akun user berhasil dihapus beserta riwayatnya.", fail: "Gagal menghapus akun user" },
    block: { ok: "Akun user berhasil diblokir.", fail: "Gagal memblokir akun user" },
    unblock: { ok: "Blokir akun user berhasil dibuka.", fail: "Gagal membuka blokir akun user" },
  };
  const userAction = async (id, action) => {
    const text = userActionText[action];
    try {
      await api(`admin/users/${id}/${action}`, { method: "POST" });
    } catch (error) {
      const reason = error.status === 403 ? "Tidak ada akses admin." : errorText(error, "coba lagi nanti.");
      showToast("error", `${text.fail}: ${reason}`);
      return;
    }
    showToast("success", text.ok);
    await refreshAfterAction();
  };
  window.blockUser = (id) => userAction(id, "block");
  window.unblockUser = (id) => userAction(id, "unblock");
  window.deleteUser = (id) => {
    if (confirm("Hapus akun user beserta riwayatnya? Tindakan ini tidak dapat dibatalkan."))
      userAction(id, "delete");
    else showToast("warning", "⚠️ Penghapusan akun dibatalkan.");
  };
  window.saveSettings = async (event) => {
    event.preventDefault();
    const limit = parseInt(cLimit.value, 10);
    const pwRate = Number(cPwRate.value);
    const captchaRate = Number(cCaptchaRate.value);
    if (!(limit >= 1 && limit <= 50)) {
      showToast("warning", "⚠️ Limit akun per transaksi harus 1–50.");
      return;
    }
    if (
      !String(cPwRate.value).trim() ||
      !String(cCaptchaRate.value).trim() ||
      !Number.isSafeInteger(pwRate) ||
      pwRate < 0 ||
      !Number.isSafeInteger(captchaRate) ||
      captchaRate < 0
    ) {
      showToast("warning", "Harga PW dan CAPTCHA harus bilangan bulat nol atau lebih.");
      return;
    }
    if (!cPass.value.trim()) {
      showToast("warning", "⚠️ Password wajib harus diisi!");
      return;
    }
    let paymentFees;
    try {
      const feeValues = [
        cFee.value,
        ...paymentMethods.map((key) => document.getElementById(`fee${key}`)?.value),
      ];
      if (feeValues.some((value) => Number(value || 0) < 0 || Number(value || 0) % FEE_STEP !== 0))
        {
          showToast("warning", "⚠️ Fee harus kelipatan Rp1.000 (contoh: 0, 1.000, 2.000).");
          return;
        }
      paymentFees = Object.fromEntries(
        paymentMethods.map((key) => [
          key,
          normalizeFee(document.getElementById(`fee${key}`)?.value || 0),
        ]),
      );
      await api("admin/settings", {
        method: "PATCH",
        body: JSON.stringify(
          settingsPayload({
            rate: pwRate,
            pwRate,
            captchaRate,
            minWithdrawal: cMin.value,
            paymentMode: cPaymentMode.value,
            fee: cFee.value,
            paymentFees,
            campaignPassword: cPass.value,
            pwText: cPwLabel.value.trim() || "PW",
            pwEnabled: db.settings.pwOpen,
            captchaEnabled: db.settings.captchaOpen,
            captchaText: cCaptcha.value.trim() || "CAPTCHA",
            dailyLimit: cDaily.value,
            batchLimit: cLimit.value,
            announcement: cAnn.value,
            rulesText: cRules.value,
            supportChannels: readSupportChannels(),
            autoStockEnabled: db.settings.autoStockEnabled === true,
            gmailStock: cStock.value
              .split(/\s+/)
              .map((x) => x.trim())
              .filter(Boolean),
          }),
        ),
      });
    } catch (error) {
      showToast("error", `Pengaturan gagal disimpan: ${errorText(error, "coba lagi nanti.")}`);
      return;
    }
    db.settings.paymentFees = paymentFees;
    db.settings.paymentMode = cPaymentMode.value;
    db.settings.rulesText = cRules.value;
    showToast("success", "Pengaturan platform berhasil disimpan!");
    try {
      await refresh(paymentFees);
    } catch (error) {
      console.error("Gagal memuat ulang data admin:", error);
      showToast("warning", "⚠️ Pengaturan tersimpan, tetapi tampilan belum ter-update. Muat ulang halaman.");
    }
  };
  window.save = async () => {
    try {
      await api("admin/settings", {
        method: "PATCH",
        body: JSON.stringify(settingsPayload()),
      });
    } catch (error) {
      showToast("error", `Gagal menyimpan perubahan: ${errorText(error, "coba lagi nanti.")}`);
      return false;
    }
    await refreshAfterAction();
    return true;
  };
  window.logout = async () => {
    try {
      await api("auth/logout", { method: "POST" });
      showToast("success", "Logout berhasil. Mengalihkan ke halaman login.");
      setTimeout(() => window.top.location.assign("/auth"), 350);
    } catch (error) {
      console.error("Admin Logout Error:", error);
      showToast("error", `Logout admin gagal: ${errorText(error, "periksa koneksi lalu coba lagi.")}`);
    }
  };
  window.addEventListener("DOMContentLoaded", async () => {
    try {
      const { user } = await api("auth/me");
      if (!user || user.role !== "admin") {
        window.top.location.replace("/auth");
        return;
      }
      await refresh();
      showApp();
      window.setInterval(() => {
        if (document.visibilityState === "visible") refresh().catch(() => {});
      }, 15000);
    } catch (error) {
      console.error("Gagal memuat dashboard admin:", error);
      showToast("error", `Gagal memuat dashboard admin: ${errorText(error, "server tidak merespons.")}`);
    }
  });
})();
