import type { ReactNode } from "react";

export function StaticPageFrame({ view }: { view: string }) {
  return (
    <iframe
      src={`/app.html?view=${view}`}
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
