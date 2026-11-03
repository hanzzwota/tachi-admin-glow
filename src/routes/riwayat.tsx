import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/riwayat")({
  component: () => <Outlet />,
});
