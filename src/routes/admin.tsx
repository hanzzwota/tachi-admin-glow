import { createFileRoute, notFound } from "@tanstack/react-router";

// The admin dashboard lives at /adminryuganteng; the old path is no longer served.
export const Route = createFileRoute("/admin")({
  beforeLoad: () => {
    throw notFound();
  },
});
