import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { StaticPageFrame } from "../components/StaticPageFrame";

export const Route = createFileRoute("/riwayat")({
  component: RiwayatLayout,
});

// /riwayat/$nomortrx adalah child dari /riwayat (file riwayat.$nomortrx.tsx).
// Layout ini WAJIB merender <Outlet /> saat berada di halaman detail; kalau tidak,
// halaman detail tidak pernah tampil dan yang dimuat malah app.html?view=riwayat
// yang me-redirect browser ke /dashboard.
function RiwayatLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isList = /^\/riwayat\/?$/.test(pathname);
  return isList ? <StaticPageFrame view="riwayat" /> : <Outlet />;
}
