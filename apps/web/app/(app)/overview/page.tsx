import { EmptyState } from '../empty-state';

export default function OverviewPage() {
  return (
    <div className="appPage">
      <h1>Overview</h1>
      <EmptyState
        title="No incidents yet"
        body="Once Jira is connected (Phase 2) and incidents start flowing in, this page will summarize open incidents, run activity, and integration health across your workspace."
      />
    </div>
  );
}
