import { useEffect, useState } from "react";

const pageForView: Record<string, string> = {
  dashboard: "dashboard",
  login: "login",
  register: "register",
  profil: "profil",
  riwayat: "riwayat",
  saldo: "saldo",
  setor: "setor",
};

function useFrameReady(frameKey: string) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
  }, [frameKey]);

  return { ready, setReady };
}

export function StaticPageFrame({ view }: { view: string }) {
  const page = pageForView[view] ?? "dashboard";
  const { ready, setReady } = useFrameReady(page);

  return (
    <div className="route-frame-shell" aria-busy={!ready}>
      {!ready && (
        <div className="route-frame-loading" role="status">
          Memuat halaman…
        </div>
      )}
      <iframe
        key={page}
        src={`/pages/${page}.html`}
        title={`tachi69gmail ${view}`}
        className="route-frame"
        onLoad={() => setReady(true)}
      />
    </div>
  );
}

export function AdminPageFrame() {
  const { ready, setReady } = useFrameReady("admin");

  return (
    <div className="route-frame-shell route-frame-shell-admin" aria-busy={!ready}>
      {!ready && (
        <div className="route-frame-loading" role="status">
          Memuat panel admin…
        </div>
      )}
      <iframe
        src="/admin.html"
        title="tachi69gmail Admin"
        className="route-frame"
        onLoad={() => setReady(true)}
      />
    </div>
  );
}
