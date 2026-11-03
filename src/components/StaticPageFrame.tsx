const pageForView: Record<string, string> = {
  dashboard: "dashboard",
  login: "login",
  register: "register",
  profil: "profil",
  riwayat: "riwayat",
  saldo: "saldo",
  setor: "setor",
};

export function StaticPageFrame({ view }: { view: string }) {
  const page = pageForView[view] ?? "dashboard";

  return (
    <div className="route-frame-shell">
      <iframe
        key={page}
        src={`/pages/${page}.html`}
        title={`tachi69gmail ${view}`}
        className="route-frame"
      />
    </div>
  );
}

export function AdminPageFrame() {
  return (
    <div className="route-frame-shell route-frame-shell-admin">
      <iframe src="/admin.html" title="tachi69gmail Admin" className="route-frame" />
    </div>
  );
}
