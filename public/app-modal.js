/* Shared user-app modal component. The API client also uses these stable IDs. */
(() => {
  let modal;

  function ensureModal() {
    modal = document.getElementById("appModal");
    if (modal) return modal;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <div
        id="appModal"
        class="fixed inset-0 z-50 hidden flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modalTitle"
      >
        <div class="w-full max-w-xs rounded-3xl bg-white p-6 shadow-2xl transition-all">
          <div class="mb-3 flex items-center justify-between">
            <h3 id="modalTitle" class="text-base font-extrabold text-slate-800">Informasi</h3>
            <button
              id="modalCloseIcon"
              type="button"
              aria-label="Tutup dialog"
              class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-500 hover:bg-slate-200"
            >
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
          <div id="modalBody" class="mb-5 whitespace-pre-line text-xs leading-relaxed text-slate-600"></div>
          <button
            id="modalCloseButton"
            type="button"
            class="w-full rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white transition active:scale-95"
          >
            Tutup
          </button>
        </div>
      </div>`;

    modal = wrapper.firstElementChild;
    document.body.appendChild(modal);
    modal.querySelectorAll("#modalCloseIcon, #modalCloseButton").forEach((button) => {
      button.addEventListener("click", closeModal);
    });
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
    });
    return modal;
  }

  function openModal(title, body) {
    const element = ensureModal();
    document.getElementById("modalTitle").textContent = String(title ?? "Informasi");
    document.getElementById("modalBody").textContent = String(body ?? "");
    element.classList.remove("hidden");
    element.classList.add("flex");
  }

  function closeModal() {
    const element = document.getElementById("appModal");
    if (!element) return;
    element.classList.add("hidden");
  }

  window.openModal = openModal;
  window.closeModal = closeModal;
  ensureModal();
})();
