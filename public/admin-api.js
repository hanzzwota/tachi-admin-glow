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
  const normalizeSupportChannels = (value) => {
    const legacyWhatsApp = Array.isArray(value?.whatsapp) ? value.whatsapp : [];
    const legacyTelegram = Array.isArray(value?.telegram) ? value.telegram : [];
    const source = Array.isArray(value?.admins) ? value.admins : [];
    return {
      admins: [0, 1].map((index) => ({
        name: source[index]?.name || `Admin ${index + 1}`,
        whatsapp: source[index]?.whatsapp || legacyWhatsApp[index] || "",
        telegram: source[index]?.telegram || legacyTelegram[index] || "",
        enabled: source[index]?.enabled !== false,
      })),
    };
  };
  const readSupportChannels = () => ({
    admins: [1, 2].map((index) => ({
      name: document.getElementById(`supportAdmin${index}Name`).value.trim() || `Admin ${index}`,
      whatsapp: document.getElementById(`supportAdmin${index}Whatsapp`).value.trim(),
      telegram: document.getElementById(`supportAdmin${index}Telegram`).value.trim(),
      enabled: document.getElementById(`supportAdmin${index}Enabled`).checked,
    })),
  });
  const normalize = (settings, deposits, users, withdrawals, paymentFeesOverride = null) => ({
    settings: {
      rate: Number(settings?.rate || 0),
      minTarik: Number(settings?.min_withdrawal || 0),
      paymentMode: settings?.payment_mode === "dana_only" ? "dana_only" : "all",
      fee: normalizeFee(settings?.fee),
      paymentFees: normalizePaymentFees(
        paymentFeesOverride ?? settings?.payment_fees,
        Number(settings?.fee || 0),
      ),
      campaignPass: settings?.campaign_password || "",
      storOpen: settings?.store_open !== false,
      tarikOpen: settings?.withdraw_open !== false,
      checkerOpen: settings?.checker_open !== false,
      dailyMax: Number(settings?.daily_limit || 0),
      limit: Number(settings?.batch_limit || 0),
      announcement: settings?.announcement || "",
      rulesText:
        settings?.rules_text ||
        "1. Gmail harus fresh.\n2. Wajib menggunakan password yang dicantumkan di bawah.\n3. Keputusan admin tachi69gmail mutlak.",
      supportChannels: normalizeSupportChannels(settings?.support_channels),
      autoStockEnabled: settings?.auto_stock_enabled === true,
      gmailStock: Array.isArray(settings?.gmail_stock) ? settings.gmail_stock : [],
    },
    setoran: Array.isArray(deposits)
      ? deposits.map((item) => ({
          ...item,
          id: item.id,
          date: new Date(item.created_at).getTime(),
          user: item.profiles?.username || item.user_id,
          emails: Array.isArray(item.emails) ? item.emails : [],
        }))
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
    const rows = dailyDeposits();
    const emails = [
      ...new Set(rows.flatMap((item) => (Array.isArray(item.emails) ? item.emails : []))),
    ];
    const stats = document.getElementById("dailyRecapStats");
    const text = document.getElementById("dailyGmailText");
    if (stats)
      stats.innerHTML = [
        `${recapDate} · ${rows.length} transaksi`,
        `${emails.length} Gmail`,
        `${rows.filter((item) => item.status === "diterima").length} diterima`,
        `${rows.filter((item) => item.status === "pending").length} pending`,
      ]
        .map(
          (value) =>
            `<div class="rounded-xl border border-blue-50 bg-white p-3 text-center text-sm font-extrabold text-blue-700">${value}</div>`,
        )
        .join("");
    if (text) text.value = emails.join("\n");
  };
  window.copyDailyGmail = async () => {
    const value = document.getElementById("dailyGmailText")?.value || "";
    if (!value) return showToast("warning", "⚠️ Belum ada Gmail rekapan untuk disalin.");
    try {
      await navigator.clipboard.writeText(value);
      showToast("success", `${value.split("\n").length} Gmail rekapan berhasil disalin!`);
    } catch (error) {
      console.error("Copy Error:", error);
      showToast("error", "Gagal menyalin Gmail rekapan. Tidak ada izin akses clipboard.");
    }
  };
  window.exportDailyGmail = () => {
    const value = document.getElementById("dailyGmailText")?.value || "";
    if (!value) return showToast("warning", "⚠️ Belum ada Gmail rekapan untuk diekspor.");
    const stamp = recapDate;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([`Rekapan Gmail Setoran ${stamp}\n\n${value}\n`], {
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
      const [{ deposits }, { users }, { settings }, { withdrawals }] = await Promise.all([
        api("admin/deposits"),
        api("admin/users"),
        api("settings"),
        api("admin/withdrawals"),
      ]);
      db = normalize(settings, deposits, users, withdrawals, paymentFeesOverride);
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
    const refreshed = normalize({}, [], users, withdrawals);
    db.withdrawals = refreshed.withdrawals;
    db.users = refreshed.users;
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
    rate: db.settings.rate,
    minWithdrawal: db.settings.minTarik,
    paymentMode: db.settings.paymentMode,
    fee: db.settings.fee,
    paymentFees: db.settings.paymentFees,
    campaignPassword: db.settings.campaignPass,
    storeOpen: db.settings.storOpen,
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
    const next = !previous;
    db.settings[key] = next;
    try {
      await api("admin/settings", {
        method: "PATCH",
        body: JSON.stringify(settingsPayload()),
      });
    } catch (error) {
      db.settings[key] = previous; // kembalikan tampilan ke kondisi sebenarnya
      window.reloadAdminDb?.();
      showToast("error", `Gagal ${next ? "membuka" : "menutup"} ${label}: ${errorText(error, "coba lagi nanti.")}`);
      return;
    }
    showToast("success", `${label} berhasil ${next ? "dibuka" : "ditutup"}!`);
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
  window.doAcc = async (id) => {
    let acceptedEmails;
    try {
      acceptedEmails = [
        ...document.querySelectorAll("input[name='acceptedEmail']:checked"),
      ].map((input) => input.value);
      if (!acceptedEmails.length) {
        showToast("warning", "⚠️ Centang minimal 1 Gmail yang ingin diterima!");
        return;
      }
      await api(`admin/deposits/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({ acceptedEmails }),
      });
    } catch (error) {
      showToast("error", `Gagal menerima setoran: ${errorText(error, "coba lagi nanti.")}`);
      return;
    }
    closeModal();
    showToast("success", "Setoran berhasil diterima dan saldo user diperbarui!");
    await refreshAfterAction();
  };
  window.doRej = async (id) => {
    try {
      let reason = document.querySelector('input[name="rr"]:checked')?.value || "Ditolak admin";
      if (reason === "Alasan Lain") {
        reason = document.getElementById("rCustom")?.value.trim() || "";
        if (!reason) {
          showToast("warning", "⚠️ Harap isi alasan penolakan kustom!");
          return;
        }
      }
      const rejectedEmails = [
        ...document.querySelectorAll("input[name='rejectedEmail']:checked"),
      ].map((input) => input.value);
      if (!rejectedEmails.length) {
        showToast("warning", "⚠️ Centang minimal 1 Gmail yang ingin ditolak!");
        return;
      }
      await api(`admin/deposits/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason, rejectedEmails }),
      });
    } catch (error) {
      showToast("error", `Gagal menolak setoran: ${errorText(error, "coba lagi nanti.")}`);
      return;
    }
    closeModal();
    showToast("success", "Setoran berhasil ditolak dan alasan tersimpan.");
    await refreshAfterAction();
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
    if (!(limit >= 1 && limit <= 50)) {
      showToast("warning", "⚠️ Limit akun per transaksi harus 1–50.");
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
            rate: cRate.value,
            minWithdrawal: cMin.value,
            paymentMode: cPaymentMode.value,
            fee: cFee.value,
            paymentFees,
            campaignPassword: cPass.value,
            dailyLimit: cDaily.value,
            batchLimit: cLimit.value,
            announcement: cAnn.value,
            rulesText: cRules.value,
            supportChannels: readSupportChannels(),
            autoStockEnabled: cAutoStock.checked,
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
      setTimeout(() => window.top.location.assign("/login"), 350);
    } catch (error) {
      console.error("Admin Logout Error:", error);
      showToast("error", `Logout admin gagal: ${errorText(error, "periksa koneksi lalu coba lagi.")}`);
    }
  };
  window.addEventListener("DOMContentLoaded", async () => {
    try {
      const { user } = await api("auth/me");
      if (!user || user.role !== "admin") {
        window.top.location.replace("/login");
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
