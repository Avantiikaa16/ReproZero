import { EmptyState } from '../empty-state';

export default function SettingsPage() {
  return (
    <div className="appPage">
      <h1>Settings</h1>
      <EmptyState
        title="Workspace settings"
        body="Organization details, member roles, and audit log access will live here as later phases land. Use the workspace switcher in the sidebar to manage organizations today."
      />
    </div>
  );
}
