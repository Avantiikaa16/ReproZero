'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState } from '../empty-state';
import { GettingStartedChecklist } from '../getting-started-checklist';

type Incident = { id: string; title: string; status: string; priority: string | null; externalTicketKey: string | null; updatedAt: string };
type Connection = { provider: string; status: string };

const OPEN_STATUSES = new Set(['New', 'Evidence needed', 'Ready to reproduce', 'Reproducing', 'Reproduced', 'Fix proposed', 'Verifying', 'Blocked']);

export default function OverviewPage() {
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [connections, setConnections] = useState<Connection[] | null>(null);

  useEffect(() => {
    fetch('/api/incidents')
      .then(async (response) => (await response.json()) as { incidents: Incident[] })
      .then((payload) => setIncidents(payload.incidents))
      .catch(() => setIncidents([]));
    fetch('/api/integrations')
      .then(async (response) => (await response.json()) as { connections: Connection[] })
      .then((payload) => setConnections(payload.connections))
      .catch(() => setConnections([]));
  }, []);

  if (incidents === null || connections === null) {
    return (
      <div className="appPage">
        <h1>Overview</h1>
        <div className="appLoadingSkeleton" aria-hidden="true"><span /><span /><span /></div>
      </div>
    );
  }

  if (incidents.length === 0) {
    return (
      <div className="appPage">
        <h1>Overview</h1>
        <GettingStartedChecklist />
        <EmptyState
          title="No incidents yet"
          body="Create an incident or connect Jira and import a ticket to get started — this page will summarize open incidents, run activity, and integration health as they come in."
        />
      </div>
    );
  }

  const open = incidents.filter((incident) => OPEN_STATUSES.has(incident.status));
  const jiraConnected = connections.some((connection) => connection.provider === 'jira' && connection.status === 'connected');

  return (
    <div className="appPage">
      <h1>Overview</h1>
      <GettingStartedChecklist />
      <div className="overviewStats">
        <div className="overviewStat"><strong>{incidents.length}</strong><span>Total incidents</span></div>
        <div className="overviewStat"><strong>{open.length}</strong><span>Open</span></div>
        <div className="overviewStat"><strong>{incidents.length - open.length}</strong><span>Completed</span></div>
        <div className="overviewStat">
          <strong className={jiraConnected ? 'ok' : 'off'}>{jiraConnected ? 'Live' : 'Off'}</strong>
          <span>Jira connection</span>
        </div>
      </div>

      <div className="incidentTable">
        <div className="incidentTableHead">
          <span>Title</span><span>Status</span><span>Priority</span><span>Source</span><span>Updated</span>
        </div>
        {incidents.slice(0, 8).map((incident) => (
          <Link key={incident.id} href={`/incidents/${incident.id}`} className="incidentTableRow">
            <span className="incidentTitle">{incident.title}</span>
            <span className={`statusBadge status-${incident.status.replace(/\s+/g, '-').toLowerCase()}`}>{incident.status}</span>
            <span>{incident.priority ?? '—'}</span>
            <span>{incident.externalTicketKey ?? 'Manual'}</span>
            <span>{new Date(incident.updatedAt).toLocaleDateString()}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
