/* Compatibility navigation for the standalone page documents. */
(() => {
  const routes = {
    login: "/login",
    register: "/register",
    dashboard: "/dashboard",
    stor: "/setor",
    setor: "/setor",
    saldo: "/saldo",
    profil: "/profil",
    riwayat: "/riwayat",
    admin: "/admin",
  };

  function navigate(view) {
    const path = routes[view];
    if (!path) return false;
    const target = window.top || window;
    try {
      const current = new URL(target.location.href);
      if (current.pathname === path && !current.search) return true;
      target.history.pushState({ view }, "", path);
      target.dispatchEvent(new PopStateEvent("popstate", { state: { view } }));
    } catch (error) {
      console.warn("Navigasi SPA tidak tersedia, memakai fallback:", error);
      target.location.assign(path);
    }
    return true;
  }

  window.navigateTo = navigate;
  // The persistent React shell owns the navigation bar. The mount point is
  // intentionally removed so legacy pages do not render a second nav.
  document.getElementById("appMainNavMount")?.remove();
})();
