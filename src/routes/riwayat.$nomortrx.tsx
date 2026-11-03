import { createFileRoute } from "@tanstack/react-router";
import { StaticPageFrame } from "../components/StaticPageFrame";

export const Route = createFileRoute("/riwayat/$nomortrx")({
  component: HistoryDetailPage,
});

function HistoryDetailPage() {
  const { nomortrx } = Route.useParams();
  return (
    <StaticPageFrame view="riwayat-detail" query={`nomortrx=${encodeURIComponent(nomortrx)}`} />
  );
}
