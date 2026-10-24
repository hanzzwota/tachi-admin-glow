/* Shared user-app navigation shell for standalone page documents. */
(() => {
  const mount = document.getElementById("appMainNavMount");
  if (!mount) return;
  const navigation = `<nav
        id="appMainNav"
        class="nav-shell hidden fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-white/95 backdrop-blur-md border border-slate-200/80 px-2 py-2 items-center justify-around gap-1 z-[60] shadow-lg"
      >
        <button
          onclick="navigateTo('dashboard')"
          id="nav-item-dashboard"
          class="nav-button flex-1 flex flex-col items-center gap-1 text-blue-600"
        >
          <i class="fa-solid fa-house text-base"></i>
          <span class="text-[10px] font-bold">Beranda</span>
        </button>
        <button
          onclick="navigateTo('riwayat')"
          id="nav-item-riwayat"
          class="nav-button flex-1 flex flex-col items-center gap-1 text-slate-400"
        >
          <i class="fa-solid fa-clock-rotate-left text-base"></i>
          <span class="text-[10px] font-semibold">Riwayat</span>
        </button>
        <button
          onclick="navigateTo('stor')"
          id="nav-item-stor"
          class="nav-stor-button flex-1 flex flex-col items-center gap-1"
        >
          <i class="fa-solid fa-paper-plane text-sm"></i>
          <span class="text-[10px] font-semibold">Setor</span>
        </button>
        <button
          onclick="navigateTo('saldo')"
          id="nav-item-saldo"
          class="nav-button flex-1 flex flex-col items-center gap-1 text-slate-400"
        >
          <i class="fa-solid fa-wallet text-base"></i>
          <span class="text-[10px] font-semibold">Saldo</span>
        </button>
        <button
          onclick="navigateTo('profil')"
          id="nav-item-profil"
          class="nav-button flex-1 flex flex-col items-center gap-1 text-slate-400"
        >
          <i class="fa-solid fa-user text-base"></i>
          <span class="text-[10px] font-semibold">Profil</span>
        </button>
      </nav>`;
  mount.insertAdjacentHTML("beforebegin", navigation);
  mount.remove();
})();
