import { EmptyState } from '../empty-state';

export default function ReproductionsPage() {
  return (
    <div className="appPage">
      <h1>Reproductions</h1>
      <EmptyState
        title="No reproduction runs yet"
        body="Reproduction runs, artifacts, and verification history for this workspace will be tracked here once the persistent run pipeline (Phase 4-5) is in place. The public demo at / is unaffected and keeps working today."
      />
    </div>
  );
}
