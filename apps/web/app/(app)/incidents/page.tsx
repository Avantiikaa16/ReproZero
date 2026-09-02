import { EmptyState } from '../empty-state';

export default function IncidentsPage() {
  return (
    <div className="appPage">
      <h1>Incidents</h1>
      <EmptyState
        title="No incidents in this workspace"
        body="Incidents will appear here once evidence adapters (starting with Jira in Phase 2) are connected, or when you create one manually."
      />
    </div>
  );
}
