import { createFileRoute, Outlet } from "@tanstack/react-router";
import { loadTopicsPage } from "@/lib/topicsPage.server";

/** Layout route: loader runs for /topics and /topics/$slug children. */
export const Route = createFileRoute("/topics")({
  loader: () => loadTopicsPage(),
  component: TopicsLayout,
});

function TopicsLayout() {
  return <Outlet />;
}
