import { useState } from "react";

export function StaticPageFrame({
  view,
  query = "",
  page = "app.html",
}: {
  view: string;
  query?: string;
  page?: string;
}) {
  const [frameLoaded, setFrameLoaded] = useState(false);
  return (
    <div className="relative h-dvh w-full">
      {!frameLoaded && (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background"
        >
          <span className="loading-spinner" aria-hidden="true" />
          <span className="text-sm font-semibold text-muted-foreground">Memuat</span>
        </div>
      )}
      <iframe
        src={`/${page}?${page === "app.html" ? `view=${encodeURIComponent(view)}` : ""}${query ? `${page === "app.html" ? "&" : ""}${query}` : ""}`}
        title={`tachi69gmail ${view}`}
        onLoad={() => setFrameLoaded(true)}
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
