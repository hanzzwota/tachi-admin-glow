export function StaticPageFrame({
  view,
  query = "",
  page = "app.html",
}: {
  view: string;
  query?: string;
  page?: string;
}) {
  return (
    <div className="relative h-dvh w-full">
      <iframe
        src={`/${page}?${page === "app.html" ? `view=${encodeURIComponent(view)}` : ""}${query ? `${page === "app.html" ? "&" : ""}${query}` : ""}`}
        title={`tachi69gmail ${view}`}
        className="block h-full w-full border-0"
      />
    </div>
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
