export function StaticPageFrame({ view }: { view: string }) {
  const page = view === "stor" ? "setor" : view;
  return (
    <iframe
      src={`/pages/${page}.html`}
      title={`tachi69gmail ${view}`}
      className="block h-screen w-full border-0"
      style={{ height: "100dvh" }}
    />
  );
}

export function AdminPageFrame() {
  return (
    <iframe
      src="/admin.html"
      title="tachi69gmail Admin"
      className="block h-screen w-full border-0"
      style={{ height: "100dvh" }}
    />
  );
}
