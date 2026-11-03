/* Compatibility navigation for the dashboard-only application. */
(() => {
  const routes = { dashboard: "/dashboard", admin: "/admin" };

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
  document.getElementById("appMainNavMount")?.remove();
})();
