'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState } from '../empty-state';

type MemoryEntry = {
  id: string;
  incidentId: string | null;
  title: string;
  rootCause: string | null;
  verifiedRepair: string | null;
  confidence: number | null;
  source: 'hosted' | 'claude_mem_live';
  createdAt: string;
};

export default function MemoryPage() {
  const [memories, setMemories] = useState<MemoryEntry[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = () => {
    fetch('/api/memory')
      .then(async (response) => (await response.json()) as { memories: MemoryEntry[] })
      .then((payload) => setMemories(payload.memories))
      .catch(() => setMemories([]));
  };

  useEffect(load, []);

  const deleteMemory = async (id: string) => {
    if (!window.confirm('Delete this stored memory permanently? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      const response = await fetch(`/api/memory/${id}`, { method: 'DELETE' });
      if (response.ok) load();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="appPage">
      <h1>Memory</h1>
      <p className="incidentSummary">
        Every verified reproduction stores its incident signature, root cause, and repair here — a hosted store,
        since Vercel can&apos;t reach a developer&apos;s local Claude-Mem worker. Entries only ever say &ldquo;Claude-Mem
        live&rdquo; when that worker genuinely confirmed the write; otherwise they&apos;re labeled &ldquo;Hosted&rdquo; honestly.
      </p>

      {memories === null ? (
        <div className="appLoadingSkeleton" aria-hidden="true"><span /><span /><span /></div>
      ) : memories.length === 0 ? (
        <EmptyState
          title="No stored incident memory"
          body="Run a reproduction to verified completion on any incident, and its lesson will be stored here for future similar incidents to reference."
        />
      ) : (
        <div className="memoryList">
          {memories.map((memory) => (
            <div key={memory.id} className="memoryEntry">
              <div className="memoryEntryHead">
                <div>
                  <strong>{memory.title}</strong>
                  <span className={`appStatusPill ${memory.source === 'claude_mem_live' ? 'live' : 'demo'}`}>
                    {memory.source === 'claude_mem_live' ? 'Claude-Mem live' : 'Hosted'}
                  </span>
                </div>
                <button className="textLinkButton" disabled={deletingId === memory.id} onClick={() => deleteMemory(memory.id)}>
                  {deletingId === memory.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
              {memory.rootCause && <p className="memoryEntryLine"><small>Root cause</small>{memory.rootCause}</p>}
              {memory.verifiedRepair && <p className="memoryEntryLine"><small>Verified repair</small>{memory.verifiedRepair}</p>}
              <div className="memoryEntryFooter">
                {memory.confidence != null && <span>confidence {memory.confidence.toFixed(2)}</span>}
                {memory.incidentId && <Link href={`/incidents/${memory.incidentId}`}>View incident →</Link>}
                <span>{new Date(memory.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
