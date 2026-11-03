import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
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
  const frameRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    let settled = false;
    const revealFrame = () => {
      if (settled) return;
      settled = true;
      window.clearInterval(readyCheck);
      setFrameLoaded(true);
    };
    const checkFrameReady = () => {
      const loadingScreen = frameRef.current?.contentDocument?.getElementById("appLoadingScreen");
      if (loadingScreen?.classList.contains("hidden")) revealFrame();
    };
    const handleMessage = (event: MessageEvent) => {
      if (
        event.origin === window.location.origin &&
        event.source === frameRef.current?.contentWindow &&
        event.data?.type === "tachi-app-ready"
      ) {
        revealFrame();
      }
    };
    window.addEventListener("message", handleMessage);
    const readyCheck = window.setInterval(checkFrameReady, 100);
    checkFrameReady();
    return () => {
      window.clearInterval(readyCheck);
      window.removeEventListener("message", handleMessage);
    };
  }, []);
  return (
    <div className="relative h-dvh w-full">
      {!frameLoaded && (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 z-10 flex items-center justify-center bg-background text-sm font-semibold text-foreground"
        >
          Memuat
        </div>
      )}
      <iframe
        ref={frameRef}
        src={`/${page}?${page === "app.html" ? `view=${view}` : ""}${query ? `${page === "app.html" ? "&" : ""}${query}` : ""}`}
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
