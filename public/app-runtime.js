// Announcement carousel data (sinkron dengan pengaturan Admin)
      function getAnnouncements() {
        const adminMsg = window.tachiApiState?.settings?.announcement?.trim() || "";
        const list = adminMsg
          ? [adminMsg]
          : ["UPDATE HARGA GMAIL TERBARU", "STOK GMAIL FRESH DIPROSES SANGAT CEPAT!"];
        return list.map((text, i) => ({ id: i + 1 + "/" + list.length, text }));
      }
      let announcements = getAnnouncements();
      let currentSlideIndex = 0;

      function openRulesToday() {
        const rules =
          window.tachiApiState?.settings?.rules_text ||
          "1. Gmail harus fresh.\n2. Wajib menggunakan password yang dicantumkan di bawah.\n3. Keputusan admin tachi69gmail mutlak.";
        openModal("Rules Hari Ini", rules);
      }
      function supportUrl(type, value) {
        const raw = String(value || "").trim();
        if (!raw) return "";
        if (/^https?:\/\//i.test(raw)) return raw;
        if (type === "whatsapp") return `https://wa.me/${raw.replace(/\D/g, "")}`;
        return `https://t.me/${raw.replace(/^@/, "")}`;
      }
      function escapeSupport(value) {
        return String(value || "").replace(
          /[&<>"']/g,
          (character) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
        );
      }
      function openSupportModal() {
        const channels = window.tachiApiState?.settings?.support_channels || {};
        const legacyAdmins = [0, 1].map((index) => ({
          name: `Admin ${index + 1}`,
          whatsapp: channels.whatsapp?.[index] || "",
          telegram: channels.telegram?.[index] || "",
          enabled: true,
        }));
        const admins = (Array.isArray(channels.admins) ? channels.admins : legacyAdmins)
          .slice(0, 2)
          .filter((admin) => admin?.enabled !== false)
          .map((admin, index) => ({
            name: escapeSupport(admin.name || `Admin ${index + 1}`),
            whatsapp: admin.whatsapp || "",
            telegram: admin.telegram || "",
          }))
          .filter((admin) => admin.whatsapp || admin.telegram);
        const body = admins.length
          ? `<div class="space-y-3"><p class="text-xs text-slate-500">Pilih admin support yang ingin dihubungi:</p>${admins
              .map((admin) => {
                const links = [
                  admin.whatsapp
                    ? `<a href="${escapeSupport(supportUrl("whatsapp", admin.whatsapp))}" target="_blank" rel="noopener" class="flex-1 rounded-xl bg-emerald-50 px-3 py-2.5 text-center text-xs font-bold text-emerald-700"><i class="fa-brands fa-whatsapp mr-1"></i>WhatsApp</a>`
                    : "",
                  admin.telegram
                    ? `<a href="${escapeSupport(supportUrl("telegram", admin.telegram))}" target="_blank" rel="noopener" class="flex-1 rounded-xl bg-sky-50 px-3 py-2.5 text-center text-xs font-bold text-sky-700"><i class="fa-brands fa-telegram mr-1"></i>Telegram</a>`
                    : "",
                ]
                  .filter(Boolean)
                  .join("");
                return `<div class="rounded-2xl border border-slate-200 bg-white p-3"><p class="mb-2 text-sm font-extrabold text-slate-800">${admin.name}</p><div class="flex gap-2">${links}</div></div>`;
              })
              .join("")}</div>`
          : '<p class="text-sm text-slate-500">Belum ada admin support yang aktif.</p>';
        document.getElementById("modalTitle").innerText = "Support CS";
        document.getElementById("modalBody").innerHTML = body;
        document.getElementById("appModal").classList.remove("hidden");
      }

      function updateSlide() {
        announcements = getAnnouncements();
        if (currentSlideIndex >= announcements.length) currentSlideIndex = 0;
        const badge = document.getElementById("announcementBadge");
        const text = document.getElementById("announcementText");
        if (badge && text) {
          badge.innerText = announcements[currentSlideIndex].id;
          text.innerText = announcements[currentSlideIndex].text;
        }
      }

      function nextSlide() {
        currentSlideIndex = (currentSlideIndex + 1) % announcements.length;
        updateSlide();
      }

      function prevSlide() {
        currentSlideIndex = (currentSlideIndex - 1 + announcements.length) % announcements.length;
        updateSlide();
      }

      // Data rekening aktif untuk sesi pengguna.
      let userBankData = { bank: "", rekening: "", nama: "" };
      let paymentEditMode = false;
      function setPaymentEditMode(enabled) {
        paymentEditMode = Boolean(enabled);
        const bank = document.getElementById("bankSelect");
        const number = document.getElementById("rekeningInput");
        const name = document.getElementById("atasNamaInput");
        const edit = document.getElementById("editPaymentButton");
        const save = document.getElementById("savePaymentButton");
        if (bank) bank.disabled = !paymentEditMode;
        if (number) number.readOnly = !paymentEditMode;
        if (name) name.readOnly = !paymentEditMode;
        if (edit) edit.classList.toggle("hidden", paymentEditMode);
        if (save) {
          save.disabled = !paymentEditMode;
          save.classList.toggle("opacity-50", !paymentEditMode);
          save.classList.toggle("cursor-not-allowed", !paymentEditMode);
        }
      }
      window.setPaymentEditMode = setPaymentEditMode;

      // Rate dinamis: ubah satu nilai ini saat harga Gmail diperbarui admin.
      function getGmailRate() {
        return Number(window.tachiApiState?.settings?.rate || 4500);
      }
      const currentGmailRate = getGmailRate();

      function isRekeningTerisi() {
        return userBankData.rekening.trim() !== "" && userBankData.nama.trim() !== "";
      }

      window.syncUserBankDataFromApi = function (bank) {
        userBankData = {
          bank: bank?.bank || "DANA",
          rekening: bank?.number || "",
          nama: bank?.name || "",
        };
        updateTarikSaldoButton();
      };

      function updateTarikSaldoButton() {
        const sudahTerisi = userBankData.rekening.trim() !== "";
        const btnTextDashboard = document.getElementById("btnTarikSaldoText");
        const btnTextSaldo = document.getElementById("withdrawButtonLabel");

        if (btnTextDashboard) {
          btnTextDashboard.innerText = sudahTerisi ? "Tarik Sekarang" : "Tarik Saldo";
        }

        // Tombol pada halaman Saldo juga harus memakai state yang sama.
        if (btnTextSaldo) {
          btnTextSaldo.innerText = sudahTerisi ? "Tarik Sekarang" : "Isi rekening terlebih dahulu";
        }
      }

      function syncUserBankDataFromInputs() {
        const bankSelect = document.getElementById("bankSelect");
        const rekeningInput = document.getElementById("rekeningInput");
        const atasNamaInput = document.getElementById("atasNamaInput");

        if (!rekeningInput || !atasNamaInput) return;

        const rekening = rekeningInput.value.trim();
        const nama = atasNamaInput.value.trim();

        if (rekening !== "" || nama !== "") {
          userBankData = {
            bank: bankSelect ? bankSelect.value : "",
            rekening: rekening,
            nama: nama,
          };
        }
      }

      function formatRupiah(value) {
        return new Intl.NumberFormat("id-ID").format(value);
      }

      function updateCurrentRate() {
        const formattedRate = `Rp${formatRupiah(currentGmailRate)}`;
        const topRate = document.getElementById("gmailRateTop");
        const saldoRate = document.getElementById("gmailRateSaldo");
        if (topRate) topRate.textContent = `${formattedRate} / Gmail`;
        if (saldoRate) saldoRate.textContent = `${formattedRate} / Gmail`;
      }

      // View Navigation Handler
      function navigateTo(viewName) {
        const routeByView = {
          login: "/login",
          register: "/register",
          dashboard: "/dashboard",
          stor: "/setor",
          saldo: "/saldo",
          profil: "/profil",
          riwayat: "/riwayat",
        };
        const route = routeByView[viewName];
        if (!route) return;
        try {
          const topWindow = window.top;
          if (topWindow && topWindow.location.pathname !== route) {
            topWindow.location.assign(route);
            return;
          }
        } catch (error) {
          console.warn("Tidak dapat mengubah route halaman:", error);
        }
        const views = ["login", "register", "dashboard", "stor", "saldo", "profil", "riwayat"];

        views.forEach((v) => {
          const el = document.getElementById(`view-${v}`);
          const btn = document.getElementById(`btn-switch-${v}`);

          if (el) {
            if (v === viewName) {
              el.classList.remove("hidden");
              el.classList.add("flex");
            } else {
              el.classList.add("hidden");
              el.classList.remove("flex");
            }
          }

          if (btn) {
            if (v === viewName) {
              btn.className =
                "px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-600 text-white transition shrink-0";
            } else {
              btn.className =
                "px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-700 text-slate-300 hover:bg-slate-600 transition shrink-0";
            }
          }
        });

        // Handle bottom nav visibility and active state highlight
        const appNav = document.getElementById("appMainNav");
        if (viewName === "login" || viewName === "register") {
          appNav.classList.add("hidden");
          appNav.classList.remove("flex");
        } else {
          appNav.classList.remove("hidden");
          appNav.classList.add("flex");

          // Update bottom nav button active highlight
          const navItems = ["dashboard", "riwayat", "stor", "saldo", "profil"];
          navItems.forEach((item) => {
            const navBtn = document.getElementById(`nav-item-${item}`);
            if (navBtn) {
              if (item === viewName) {
                navBtn.className =
                  item === "stor"
                    ? "nav-stor-button flex-1 flex flex-col items-center gap-1 text-blue-600"
                    : "nav-button flex-1 flex flex-col items-center gap-1 text-blue-600";
                const txt = navBtn.querySelector("span");
                if (txt) txt.className = "text-[10px] font-bold";
              } else {
                navBtn.className =
                  item === "stor"
                    ? "nav-stor-button flex-1 flex flex-col items-center gap-1 text-slate-400"
                    : "nav-button flex-1 flex flex-col items-center gap-1 text-slate-400";
                const txt = navBtn.querySelector("span");
                if (txt) txt.className = "text-[10px] font-semibold";
              }
            }
          });
        }

        if (viewName === "dashboard" || viewName === "saldo") {
          syncUserBankDataFromInputs();
          updateTarikSaldoButton();
        }

        if (viewName === "profil") {
          const bankSelect = document.getElementById("bankSelect");
          const rekeningInput = document.getElementById("rekeningInput");
          const atasNamaInput = document.getElementById("atasNamaInput");
          if (bankSelect) bankSelect.value = userBankData.bank;
          if (rekeningInput) rekeningInput.value = userBankData.rekening;
          if (atasNamaInput) atasNamaInput.value = userBankData.nama;
        }

        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      // Form Submission logic
      // Placeholder sampai /api-client.js termuat (fungsi asli menimpa ini).
      // Tidak boleh menampilkan success karena belum ada request ke server.
      function handleAuthSubmit(event) {
        event.preventDefault();
        showToast("warning", "⚠️ Sistem belum siap. Muat ulang halaman lalu coba lagi.");
      }

      function logout() {
        showToast("warning", "⚠️ Sistem belum siap. Muat ulang halaman lalu coba lagi.");
      }

      // Password visibility toggle helper
      function togglePasswordVisibility(inputId, btn) {
        const input = document.getElementById(inputId);
        const icon = btn.querySelector("i");
        if (input.type === "password") {
          input.type = "text";
          icon.className = "fa-regular fa-eye-slash";
        } else {
          input.type = "password";
          icon.className = "fa-regular fa-eye";
        }
      }

      // Clipboard copy function
      async function copyToClipboard(text) {
        if (!text) {
          showToast("warning", "⚠️ Tidak ada teks untuk disalin.");
          return;
        }
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
          } else {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const copied = document.execCommand("copy");
            document.body.removeChild(textArea);
            if (!copied) throw new Error("execCommand copy gagal");
          }
          showToast("success", "Teks berhasil disalin ke clipboard!");
        } catch (err) {
          console.error("Copy Error:", err);
          showToast("error", "Gagal menyalin teks. Silakan salin secara manual.");
        }
      }

      // Line counter for Stor Email textarea
      function updateLineCounter() {
        const input = document.getElementById("gmailListInput");
        const badge = document.getElementById("lineCounterBadge");
        if (input && badge) {
          const text = input.value.trim();
          const lines = text ? text.split("\n").filter((line) => line.trim() !== "").length : 0;
          badge.innerText = `${lines} baris`;
        }
      }

      function submitGmailStoran() {
        const input = document.getElementById("gmailListInput");
        if (!input.value.trim()) {
          showToast("warning", "⚠️ Masukkan minimal 1 alamat Gmail sebelum menyetor!");
          return;
        }
        showToast("warning", "⚠️ Sistem belum siap. Muat ulang halaman lalu coba lagi.");
      }

      // Account / Bank Details saving logic
      function saveBankDetails() {
        const bank = document.getElementById("bankSelect").value;
        const rek = document.getElementById("rekeningInput").value.trim();
        const nama = document.getElementById("atasNamaInput").value.trim();

        if (!rek || !nama) {
          showToast("warning", "⚠️ Lengkapi nomor rekening dan nama pemilik!");
          return;
        }
        showToast("warning", "⚠️ Sistem belum siap. Muat ulang halaman lalu coba lagi.");
      }

      function handleTarikSaldo() {
        if (!isRekeningTerisi()) {
          showToast("warning", "⚠️ Isi data rekening di menu Profil terlebih dahulu.");
          return;
        }
        showToast("warning", "⚠️ Sistem belum siap. Muat ulang halaman lalu coba lagi.");
      }

      function updatePassword() {
        const oldP = document.getElementById("old-password").value;
        const newP = document.getElementById("new-password").value;

        if (!oldP || !newP) {
          showToast("warning", "⚠️ Isi kata sandi lama dan kata sandi baru!");
          return;
        }
        showToast("warning", "⚠️ Fitur ganti kata sandi belum tersedia. Hubungi admin untuk reset.");
      }

      // Password Wajib selalu mengikuti pengaturan admin terbaru.
      function copyCampaignPassword() {
        const data = typeof db === "function" ? db() : null;
        copyToClipboard(data?.settings?.campaignPass || "");
      }

      // Riwayat setoran dirender dari state API Supabase.
      window.activeRiwayatFilter = "semua";
      function renderRiwayat(filter = "semua") {
        if (window.tachiApiState && typeof window.renderRiwayat === "function") {
          window.activeRiwayatFilter = filter;
          window.renderRiwayat(filter);
          return;
        }
        const container = document.getElementById("riwayatListContainer");
        if (!container || typeof db !== "function") return;
        window.activeRiwayatFilter = filter;
        const data = db();
        const username = me();
        const statusMap = { diterima: "diterima", pending: "pending", gagal: "ditolak" };
        const records = (data.setoran || [])
          .filter((item) => item.user === username)
          .filter((item) => filter === "semua" || item.status === statusMap[filter])
          .sort((a, b) => (b.date || 0) - (a.date || 0));
        if (!records.length) {
          const label =
            filter === "semua" ? "Belum ada riwayat setoran" : `Belum ada setoran ${filter}`;
          container.innerHTML = `<div class="w-16 h-16 rounded-3xl bg-blue-50 text-blue-500 flex items-center justify-center text-2xl mx-auto mb-2"><i class="fa-regular fa-folder-open"></i></div><h3 class="text-sm font-extrabold text-slate-700">${label}</h3><p class="text-xs text-slate-400 font-medium max-w-[220px] mx-auto">Setor Gmail kamu sekarang untuk mulai mendapatkan saldo!</p>`;
          return;
        }
        const status = {
          pending: ["Menunggu", "bg-amber-50 text-amber-700", "fa-hourglass-half"],
          diterima: ["Diterima", "bg-emerald-50 text-emerald-700", "fa-circle-check"],
          ditolak: ["Gagal", "bg-rose-50 text-rose-700", "fa-circle-xmark"],
        };
        container.classList.remove("my-auto", "py-12", "text-center");
        container.innerHTML = records
          .map((item) => {
            const meta = status[item.status] || status.pending;
            const earned = item.earned ?? (item.accepted || 0) * (data.settings.rate || 0);
            const reason = item.reason
              ? `<p class="text-[11px] text-rose-600 mt-2">Alasan: ${String(item.reason).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c])}</p>`
              : "";
            return `<article class="bg-white rounded-2xl p-4 border border-slate-100 card-soft-shadow text-left"><div class="flex items-center justify-between gap-3"><div><p class="font-mono text-xs font-bold text-slate-700">${item.id}</p><p class="text-[11px] text-slate-400 mt-1">${new Date(item.date).toLocaleString("id-ID")}</p></div><span class="${meta[1]} rounded-full px-2.5 py-1 text-[11px] font-extrabold flex items-center gap-1"><i class="fa-solid ${meta[2]}"></i>${meta[0]}</span></div><div class="mt-3 flex justify-between text-xs"><span class="text-slate-500">${item.emails.length} Gmail</span><strong class="${item.status === "diterima" ? "text-emerald-600" : "text-slate-700"}">${item.status === "diterima" ? "+" + "Rp" + earned.toLocaleString("id-ID") : item.status === "ditolak" ? "Tidak dibayar" : "Diproses"}</strong></div>${reason}</article>`;
          })
          .join("");
      }
      function filterRiwayat(filter, btn) {
        document
          .querySelectorAll(".riwayat-tab-btn")
          .forEach(
            (b) =>
              (b.className =
                "riwayat-tab-btn flex-1 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-xl transition text-center"),
          );
        if (btn)
          btn.className =
            "riwayat-tab-btn flex-1 py-2 text-xs font-extrabold rounded-xl bg-blue-600 text-white transition text-center shadow-sm";
        renderRiwayat(filter);
      }

      // Notifikasi memakai window.showToast(type, message) dari /toast.js.
