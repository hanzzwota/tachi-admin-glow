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
  const notify = (message, icon = "success") => window.toast?.(message, icon);
  const paymentMethods = ["DANA", "OVO", "GoPay", "ShopeePay", "BCA", "BRI", "Mandiri"];
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
        const amount = Number(entry?.[1] ?? fallback);
        return [method, Number.isFinite(amount) ? Math.max(0, amount) : Math.max(0, fallback)];
      }),
    );
  };
  const normalize = (settings, deposits, users, withdrawals, paymentFeesOverride = null) => ({
    settings: {
      rate: Number(settings?.rate || 0),
      minTarik: Number(settings?.min_withdrawal || 0),
      fee: Number(settings?.fee || 0),
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
    daily: { date: new Date().toISOString().slice(0, 10), count: 0 },
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
    if (!value) return notify("Belum ada Gmail untuk disalin");
    try {
      await navigator.clipboard.writeText(value);
      notify(`${value.split("\n").length} Gmail disalin`);
    } catch {
      notify("Gagal menyalin Gmail");
    }
  };
  window.exportDailyGmail = () => {
    const value = document.getElementById("dailyGmailText")?.value || "";
    if (!value) return notify("Belum ada Gmail untuk diekspor");
    const stamp = recapDate;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([`Rekapan Gmail Setoran ${stamp}\n\n${value}\n`], {
        type: "text/plain;charset=utf-8",
      }),
    );
    link.download = `rekapan-gmail-${stamp}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
    notify("File rekapan berhasil diekspor");
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
  window.persistSettings = async () => {
    try {
      await api("admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          rate: db.settings.rate,
          minWithdrawal: db.settings.minTarik,
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
          autoStockEnabled: db.settings.autoStockEnabled,
          gmailStock: db.settings.gmailStock,
        }),
      });
      await refresh();
      notify("Status fitur diperbarui");
    } catch (error) {
      notify(error.message, "error");
    }
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
      if (result.user.role !== "admin") throw new Error("Akun ini bukan admin");
      await refresh();
      showApp();
    } catch (error) {
      lerr.textContent = error.message;
    }
  };
  window.doAcc = async (id) => {
    try {
      const acceptedEmails = [
        ...document.querySelectorAll("input[name='acceptedEmail']:checked"),
      ].map((input) => input.value);
      await api(`admin/deposits/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({ acceptedEmails }),
      });
      closeModal();
      await refresh();
      notify("Setoran diterima dan saldo user diperbarui");
    } catch (error) {
      notify(error.message, "error");
    }
  };
  window.doRej = async (id) => {
    try {
      const reason = document.querySelector('input[name="rr"]:checked')?.value || "Ditolak admin";
      const rejectedEmails = [
        ...document.querySelectorAll("input[name='rejectedEmail']:checked"),
      ].map((input) => input.value);
      await api(`admin/deposits/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason, rejectedEmails }),
      });
      closeModal();
      await refresh();
      notify("Setoran ditolak");
    } catch (error) {
      notify(error.message, "error");
    }
  };
  window.accWd = async (id) => {
    try {
      await api(`admin/withdrawals/${id}/approve`, { method: "POST" });
      await refresh();
      notify("Penarikan diselesaikan");
    } catch (error) {
      notify(error.message, "error");
    }
  };
  window.rejWd = async (id) => {
    const reason = document.getElementById("wdR")?.value.trim();
    if (!reason) return notify("Alasan wajib diisi");
    try {
      await api(`admin/withdrawals/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      closeModal();
      await refresh();
      notify("Penarikan ditolak dan saldo dikembalikan");
    } catch (error) {
      notify(error.message, "error");
    }
  };
  const userAction = async (id, action) => {
    try {
      await api(`admin/users/${id}/${action}`, { method: "POST" });
      await refresh();
      notify(
        action === "delete"
          ? "Akun dihapus"
          : action === "block"
            ? "Akun diblokir"
            : "Akun dibuka kembali",
      );
    } catch (error) {
      notify(error.message, "error");
    }
  };
  window.blockUser = (id) => userAction(id, "block");
  window.unblockUser = (id) => userAction(id, "unblock");
  window.deleteUser = (id) => {
    if (confirm("Hapus akun user beserta riwayatnya? Tindakan ini tidak dapat dibatalkan."))
      userAction(id, "delete");
  };
  window.saveSettings = async (event) => {
    event.preventDefault();
    try {
      const paymentFees = Object.fromEntries(
        ["DANA", "OVO", "GoPay", "ShopeePay", "BCA", "BRI", "Mandiri"].map((key) => [
          key,
          Math.max(0, Number(document.getElementById(`fee${key}`)?.value || 0)),
        ]),
      );
      await api("admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          rate: cRate.value,
          minWithdrawal: cMin.value,
          fee: cFee.value,
          paymentFees,
          campaignPassword: cPass.value,
          storeOpen: db.settings.storOpen,
          withdrawOpen: db.settings.tarikOpen,
          checkerOpen: db.settings.checkerOpen,
          dailyLimit: cDaily.value,
          batchLimit: cLimit.value,
          announcement: cAnn.value,
          rulesText: cRules.value,
          autoStockEnabled: cAutoStock.checked,
          gmailStock: cStock.value
            .split(/\s+/)
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      });
      db.settings.paymentFees = paymentFees;
      db.settings.rulesText = cRules.value;
      await refresh(paymentFees);
      notify("Pengaturan tersimpan");
    } catch (error) {
      notify(error.message, "error");
    }
  };
  window.save = async () => {
    try {
      await api("admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          rate: db.settings.rate,
          minWithdrawal: db.settings.minTarik,
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
          autoStockEnabled: db.settings.autoStockEnabled,
          gmailStock: db.settings.gmailStock,
        }),
      });
      await refresh();
    } catch (error) {
      notify(error.message, "error");
    }
  };
  window.logout = async () => {
    try {
      await api("auth/logout", { method: "POST" });
    } finally {
      location.href = "/login";
    }
  };
  window.addEventListener("DOMContentLoaded", async () => {
    try {
      const { user } = await api("auth/me");
      if (!user || user.role !== "admin") {
        location.href = "/login";
        return;
      }
      await refresh();
      showApp();
      window.setInterval(() => {
        if (document.visibilityState === "visible") refresh().catch(() => {});
      }, 15000);
    } catch (error) {
      notify(error.message, "error");
    }
  });
})();
