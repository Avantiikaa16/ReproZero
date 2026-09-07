'use client';

import { useState } from 'react';

type JiraTicketSummary = {
  key: string;
  summary: string;
  status: string;
  priority: string | null;
  assignee: string | null;
  updated: string;
  labels: string[];
};

const PAGE_SIZE = 10;

export function JiraImportPanel({ onImported }: { onImported: () => void }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [assignee, setAssignee] = useState('');
  const [startAt, setStartAt] = useState(0);
  const [results, setResults] = useState<{ issues: JiraTicketSummary[]; hasMore: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async (nextStartAt = 0) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ startAt: String(nextStartAt), maxResults: String(PAGE_SIZE) });
      if (query) params.set('q', query);
      if (status) params.set('status', status);
      if (priority) params.set('priority', priority);
      if (assignee) params.set('assignee', assignee);

      const response = await fetch(`/api/integrations/jira/tickets?${params.toString()}`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? 'Search failed.');
      }
      setResults(await response.json());
      setStartAt(nextStartAt);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Search failed.');
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const importTicket = async (key: string) => {
    setImportingKey(key);
    try {
      const response = await fetch(`/api/integrations/jira/tickets/${key}/import`, { method: 'POST' });
      if (response.ok) onImported();
    } finally {
      setImportingKey(null);
    }
  };

  return (
    <div className="jiraImportPanel">
      <div className="jiraImportFilters">
        <input placeholder="Search text…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <input placeholder="Status (e.g. Open)" value={status} onChange={(event) => setStatus(event.target.value)} />
        <input placeholder="Priority (e.g. High)" value={priority} onChange={(event) => setPriority(event.target.value)} />
        <input placeholder="Assignee name" value={assignee} onChange={(event) => setAssignee(event.target.value)} />
        <button className="primaryButtonSmall" disabled={loading} onClick={() => search(0)}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {error && <p className="runSummaryError">{error}</p>}

      {results && (
        <>
          <div className="jiraImportResults">
            {results.issues.length === 0 && <p className="incidentSummary">No matching tickets.</p>}
            {results.issues.map((issue) => (
              <div key={issue.key} className="jiraImportRow">
                <div>
                  <strong>{issue.key}</strong>
                  <span>{issue.summary}</span>
                  <small>{issue.status}{issue.priority ? ` · ${issue.priority}` : ''}{issue.assignee ? ` · ${issue.assignee}` : ''}</small>
                </div>
                <button className="secondaryButton" disabled={importingKey === issue.key} onClick={() => importTicket(issue.key)}>
                  {importingKey === issue.key ? 'Importing…' : 'Import'}
                </button>
              </div>
            ))}
          </div>
          <div className="jiraImportPagination">
            <button className="secondaryButton" disabled={loading || startAt === 0} onClick={() => search(Math.max(0, startAt - PAGE_SIZE))}>
              Previous
            </button>
            <span>Showing {startAt + 1}–{startAt + results.issues.length}</span>
            <button className="secondaryButton" disabled={loading || !results.hasMore} onClick={() => search(startAt + PAGE_SIZE)}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
