'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState } from '../empty-state';
import { JiraImportPanel } from './jira-import-panel';

type Incident = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  externalTicketKey: string | null;
  updatedAt: string;
};

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showJiraImport, setShowJiraImport] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => {
    fetch('/api/incidents')
      .then(async (response) => (await response.json()) as { incidents: Incident[] })
      .then((payload) => setIncidents(payload.incidents))
      .catch(() => setIncidents([]));
  };

  useEffect(load, []);

  const createIncident = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const response = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, summary: summary || undefined }),
      });
      if (!response.ok) throw new Error('Failed to create incident.');
      setTitle('');
      setSummary('');
      setShowCreate(false);
      load();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="appPage">
      <div className="appPageHead">
        <h1>Incidents</h1>
        <div className="appPageHeadActions">
          <button className="secondaryButton" onClick={() => { setShowJiraImport((value) => !value); setShowCreate(false); }}>
            {showJiraImport ? 'Cancel' : 'Import from Jira'}
          </button>
          <button className="primaryButtonSmall" onClick={() => { setShowCreate((value) => !value); setShowJiraImport(false); }}>
            {showCreate ? 'Cancel' : 'New incident'}
          </button>
        </div>
      </div>

      {showJiraImport && (
        <JiraImportPanel onImported={() => { setShowJiraImport(false); load(); }} />
      )}

      {showCreate && (
        <div className="incidentCreateForm">
          <label>
            <span>Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Firewall stuck DELETING after VPC removal" />
          </label>
          <label>
            <span>Summary (optional)</span>
            <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} placeholder="What's known so far…" />
          </label>
          <button className="primaryButtonSmall" disabled={creating || !title.trim()} onClick={createIncident}>
            {creating ? 'Creating…' : 'Create incident'}
          </button>
        </div>
      )}

      {incidents === null ? (
        <div className="appLoadingSkeleton" aria-hidden="true"><span /><span /><span /></div>
      ) : incidents.length === 0 ? (
        <EmptyState
          title="No incidents in this workspace"
          body="Create one manually above, or connect Jira from Integrations and import a ticket."
        />
      ) : (
        <div className="incidentTable">
          <div className="incidentTableHead">
            <span>Title</span>
            <span>Status</span>
            <span>Priority</span>
            <span>Source</span>
            <span>Updated</span>
          </div>
          {incidents.map((incident) => (
            <Link key={incident.id} href={`/incidents/${incident.id}`} className="incidentTableRow">
              <span className="incidentTitle">{incident.title}</span>
              <span className={`statusBadge status-${incident.status.replace(/\s+/g, '-').toLowerCase()}`}>{incident.status}</span>
              <span>{incident.priority ?? '—'}</span>
              <span>{incident.externalTicketKey ?? 'Manual'}</span>
              <span>{new Date(incident.updatedAt).toLocaleDateString()}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
