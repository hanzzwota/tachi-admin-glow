import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { StaticPageFrame } from "../components/StaticPageFrame";

export const Route = createFileRoute("/riwayat")({
  component: RiwayatLayout,
});

// /riwayat/$nomortrx adalah child dari /riwayat (file riwayat.$nomortrx.tsx).
// Layout ini merender list hanya pada /riwayat dan Outlet pada halaman detail.
function RiwayatLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isList = /^\/riwayat\/?$/.test(pathname);
  return isList ? <StaticPageFrame view="riwayat" /> : <Outlet />;
}
