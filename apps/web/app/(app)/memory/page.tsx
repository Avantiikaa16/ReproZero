import { EmptyState } from '../empty-state';

export default function MemoryPage() {
  return (
    <div className="appPage">
      <h1>Memory</h1>
      <EmptyState
        title="No stored incident memory"
        body="Similar-incident recall and verified-repair memory (Claude-Mem, Phase 7) will surface here, with a clear indicator whenever the memory worker is unavailable rather than a silent fallback."
      />
    </div>
  );
}
