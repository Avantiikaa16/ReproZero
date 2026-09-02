import { EmptyState } from '../empty-state';

export default function IntegrationsPage() {
  return (
    <div className="appPage">
      <h1>Integrations</h1>
      <EmptyState
        title="No integrations connected"
        body="Connect Jira, and later other evidence sources, from this page (Phase 2). Each connection will clearly show its status: connected, pending, error, or disabled."
      />
    </div>
  );
}
