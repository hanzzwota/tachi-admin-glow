/*
 * Outlined Toast Notification — satu-satunya sistem notifikasi aplikasi.
 *
 *   showToast('success', 'Login berhasil! Selamat datang. 🚀');
 *   showToast('error',   'Login gagal! Username atau password salah. 😟');
 *   showToast('warning', '⚠️ Harap isi semua kolom yang wajib!');
 *
 * - Tipe: success (hijau), error (merah), warning (kuning + ⚠️).
 * - Durasi tampil 3 detik.
 * - Anti-duplikat: toast dengan tipe + pesan yang sama tidak ditumpuk; yang
 *   sedang tampil hanya diperpanjang waktunya.
 * - Tipe yang tidak dikenal TIDAK pernah ditampilkan sebagai success.
 */
(() => {
  if (window.showToast && window.showToast.__outlined) return;

  const DURATION = 3000;
  const MAX_VISIBLE = 4;
  const TYPES = {
    success: { color: "#16a34a", soft: "#f0fdf4", icon: "✓", label: "Berhasil" },
    error: { color: "#dc2626", soft: "#fef2f2", icon: "✕", label: "Gagal" },
    warning: { color: "#ca8a04", soft: "#fefce8", icon: "!", label: "Peringatan" },
  };

  const style = document.createElement("style");
  style.textContent = `
    .otoast-stack{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483000;display:flex;flex-direction:column;gap:10px;width:min(420px,calc(100vw - 24px));pointer-events:none}
    .otoast{pointer-events:auto;display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border-radius:14px;background:#fff;border:2px solid var(--otoast-color);box-shadow:0 10px 30px -12px rgba(15,23,42,.25);font:600 13px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a;opacity:0;transform:translateY(-10px) scale(.98);transition:opacity .22s ease,transform .22s ease;position:relative;overflow:hidden}
    .otoast.show{opacity:1;transform:none}
    .otoast-icon{flex:none;width:24px;height:24px;border-radius:999px;display:grid;place-items:center;font-size:13px;font-weight:800;color:var(--otoast-color);background:var(--otoast-soft);border:1.5px solid var(--otoast-color)}
    .otoast-body{flex:1;min-width:0}
    .otoast-title{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--otoast-color)}
    .otoast-msg{margin-top:1px;word-break:break-word;font-weight:600}
    .otoast-close{flex:none;border:0;background:transparent;color:#94a3b8;font-size:16px;line-height:1;cursor:pointer;padding:2px}
    .otoast-close:hover{color:var(--otoast-color)}
    .otoast-bar{position:absolute;left:0;bottom:0;height:3px;background:var(--otoast-color);opacity:.55;width:100%;transform-origin:left;animation:otoast-bar var(--otoast-duration) linear forwards}
    @keyframes otoast-bar{from{transform:scaleX(1)}to{transform:scaleX(0)}}
  `;

  const active = new Map(); // key -> { el, timer }
  let stack = null;
  const ensureStack = () => {
    if (stack && document.body.contains(stack)) return stack;
    if (!document.head.contains(style)) document.head.appendChild(style);
    stack = document.createElement("div");
    stack.className = "otoast-stack";
    stack.setAttribute("role", "region");
    stack.setAttribute("aria-label", "Notifikasi");
    document.body.appendChild(stack);
    return stack;
  };

  const dismiss = (key) => {
    const item = active.get(key);
    if (!item) return;
    active.delete(key);
    clearTimeout(item.timer);
    item.el.classList.remove("show");
    setTimeout(() => item.el.remove(), 250);
  };

  const restartBar = (el) => {
    const bar = el.querySelector(".otoast-bar");
    if (!bar) return;
    bar.style.animation = "none";
    void bar.offsetWidth;
    bar.style.animation = "";
  };

  function showToast(type, message) {
    let kind = String(type || "").toLowerCase();
    if (!TYPES[kind]) {
      console.warn("[showToast] tipe tidak dikenal:", type, "— ditampilkan sebagai warning");
      kind = "warning";
    }
    let text = String(message ?? "").trim();
    if (!text) text = kind === "error" ? "Terjadi kesalahan." : "Perhatian.";
    if (kind === "warning" && !text.startsWith("⚠️")) text = `⚠️ ${text}`;

    const key = `${kind}::${text}`;
    const existing = active.get(key);
    if (existing) {
      // Anti-duplikat: perpanjang toast yang sama, jangan buat baru.
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => dismiss(key), DURATION);
      restartBar(existing.el);
      return;
    }

    const container = ensureStack();
    const cfg = TYPES[kind];
    const el = document.createElement("div");
    el.className = `otoast otoast-${kind}`;
    el.setAttribute("role", kind === "error" ? "alert" : "status");
    el.style.setProperty("--otoast-color", cfg.color);
    el.style.setProperty("--otoast-soft", cfg.soft);
    el.style.setProperty("--otoast-duration", `${DURATION}ms`);
    el.innerHTML = `<span class="otoast-icon" aria-hidden="true">${cfg.icon}</span><div class="otoast-body"><div class="otoast-title"></div><div class="otoast-msg"></div></div><button type="button" class="otoast-close" aria-label="Tutup">×</button><span class="otoast-bar"></span>`;
    el.querySelector(".otoast-title").textContent = cfg.label;
    el.querySelector(".otoast-msg").textContent = text;
    el.querySelector(".otoast-close").addEventListener("click", () => dismiss(key));
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));

    active.set(key, { el, timer: setTimeout(() => dismiss(key), DURATION) });
    while (active.size > MAX_VISIBLE) dismiss(active.keys().next().value);
  }
  showToast.__outlined = true;
  window.showToast = showToast;

  /**
   * Ubah error fetch/HTTP menjadi pesan yang jelas.
   * - Gagal jaringan (TypeError "Failed to fetch") -> pesan koneksi.
   * - Error HTTP -> pesan dari backend bila ada, selain itu fallback kontekstual.
   */
  window.toastErrorMessage = (error, fallback) => {
    if (error && error.isNetworkError) return "Koneksi gagal! Periksa jaringan Anda lalu coba lagi.";
    const message = error && typeof error.message === "string" ? error.message.trim() : "";
    return message || fallback || "Terjadi kesalahan sistem. Coba lagi nanti.";
  };
})();
