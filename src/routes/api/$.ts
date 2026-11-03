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

  const tryPatch = async (values: Record<string, unknown>) => {
    try {
      await patchSettings(values);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const optionalColumnMissing =
        message.includes("PGRST204") ||
        message.includes("column") && message.includes("does not exist") ||
        /400/.test(message);
      if (!optionalColumnMissing) throw error;
      return false;
    }
  };

  const cleanOptionalKeys = new Set([
    "payment_fees",
    "rules_text",
    "support_channels",
    "payment_mode",
  ]);

  const primary = await tryPatch(allowed);
  if (!primary) {
    const corePayload = Object.fromEntries(
      Object.entries(allowed).filter(([key]) => !cleanOptionalKeys.has(key)),
    );
    const coreSaved = await tryPatch(corePayload);
    if (!coreSaved) {
      throw new Error(
        "Gagal menyimpan konfigurasi app_settings. Pastikan struktur tabel Supabase sudah benar.",
      );
    }

    for (const key of cleanOptionalKeys) {
      const value = allowed[key as keyof typeof allowed];
      if (value === undefined) continue;
      try {
        await patchSettings({ [key]: value });
      } catch {
        // ignore optional compatibility issues on older schemas
      }
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
