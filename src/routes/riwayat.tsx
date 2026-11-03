import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/riwayat")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
});
