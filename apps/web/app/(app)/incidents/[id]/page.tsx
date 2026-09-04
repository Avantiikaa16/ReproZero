'use client';

import { useUser } from '@clerk/nextjs';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const STATUSES = [
  'New', 'Evidence needed', 'Ready to reproduce', 'Reproducing', 'Reproduced',
  'Fix proposed', 'Verifying', 'Verified', 'Blocked', 'Completed',
];

type Incident = {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  priority: string | null;
  assigneeId: string | null;
  externalTicketKey: string | null;
  reopenedCount: number;
};

type JiraSnapshot = {
  externalKey: string;
  summary: string;
  description: string;
  status: string;
  priority: string | null;
  assigneeName: string | null;
  labels: string[];
  comments: Array<{ author: string; body: string; createdAt: string }>;
  attachments: Array<{ filename: string; url: string }>;
  fetchedAt: string;
};

type Note = { id: string; type: string; content: string; createdAt: string; metadata: Record<string, unknown> };
type Run = { id: string; status: string; mode: string; result: Record<string, unknown>; createdAt: string };

export default function IncidentDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useUser();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [jiraSnapshot, setJiraSnapshot] = useState<JiraSnapshot | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    fetch(`/api/incidents/${params.id}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Not found');
        return response.json() as Promise<{ incident: Incident; jiraSnapshot: JiraSnapshot | null; notes: Note[]; runs: Run[] }>;
      })
      .then((payload) => {
        setIncident(payload.incident);
        setJiraSnapshot(payload.jiraSnapshot);
        setNotes(payload.notes);
        setRuns(payload.runs);
      })
      .catch(() => setIncident(null));
  };

  useEffect(load, [params.id]);

  const updateIncident = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/incidents/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) load();
    } finally {
      setBusy(false);
    }
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/incidents/${params.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'note', content: noteText }),
      });
      if (response.ok) {
        setNoteText('');
        load();
      }
    } finally {
      setBusy(false);
    }
  };

  const runReproduction = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/incidents/${params.id}/run`, { method: 'POST' });
      if (response.ok) load();
    } finally {
      setBusy(false);
    }
  };

  const resyncJira = async () => {
    if (!incident?.externalTicketKey) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/integrations/jira/tickets/${incident.externalTicketKey}/import`, { method: 'POST' });
      if (response.ok) load();
    } finally {
      setBusy(false);
    }
  };

  if (incident === null) {
    return (
      <div className="appPage">
        <div className="appLoadingSkeleton" aria-hidden="true"><span /><span /><span /></div>
      </div>
    );
  }

  const latestRun = runs[0];

  return (
    <div className="appPage incidentWorkspace">
      <div className="incidentMain">
        <div className="incidentHeader">
          <div>
            <small className="incidentEyebrow">{incident.externalTicketKey ?? 'Manually created'}</small>
            <h1>{incident.title}</h1>
          </div>
          <select
            className="statusSelect"
            value={incident.status}
            disabled={busy}
            onChange={(event) => updateIncident({ status: event.target.value })}
          >
            {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>

        {incident.summary && <p className="incidentSummary">{incident.summary}</p>}

        <div className="incidentActionRow">
          <button className="secondaryButton" disabled={busy} onClick={runReproduction}>Run reproduction</button>
          {incident.assigneeId ? (
            <button className="secondaryButton" disabled={busy} onClick={() => updateIncident({ assigneeId: null })}>Unassign</button>
          ) : (
            <button className="secondaryButton" disabled={busy || !user} onClick={() => updateIncident({ assigneeId: 'me' })}>
              Assign to me
            </button>
          )}
          {incident.status === 'Completed' ? (
            <button className="secondaryButton" disabled={busy} onClick={() => updateIncident({ status: 'New' })}>Reopen</button>
          ) : (
            <button className="primaryButtonSmall" disabled={busy} onClick={() => updateIncident({ status: 'Completed' })}>Mark completed</button>
          )}
        </div>

        {latestRun && (
          <div className="runSummaryCard">
            <div className="runSummaryHead">
              <span className="appStatusPill demo">Demo simulation</span>
              <strong>{latestRun.status === 'succeeded' ? 'Reproduction verified' : latestRun.status === 'failed' ? 'Reproduction not supported yet' : 'Running…'}</strong>
            </div>
            {latestRun.status === 'failed' && typeof latestRun.result.error === 'string' && (
              <p className="runSummaryError">{latestRun.result.error}</p>
            )}
            {latestRun.status === 'succeeded' && (
              <p className="runSummaryError" style={{ color: '#8fe28f' }}>
                Verdict: {String((latestRun.result as { verdict?: string }).verdict ?? 'FIX_VERIFIED')} — see Reproductions for full evidence.
              </p>
            )}
          </div>
        )}

        <div className="incidentNotes">
          <h2>Timeline</h2>
          <div className="noteComposer">
            <textarea rows={2} placeholder="Add a note, evidence, or update…" value={noteText} onChange={(event) => setNoteText(event.target.value)} />
            <button className="primaryButtonSmall" disabled={busy || !noteText.trim()} onClick={addNote}>Add</button>
          </div>
          <div className="noteTimeline">
            {notes.length === 0 && <p className="incidentSummary">No notes yet.</p>}
            {notes.map((note) => (
              <div key={note.id} className={`noteItem note-${note.type}`}>
                <small>{note.type} · {new Date(note.createdAt).toLocaleString()}</small>
                <p>{note.content}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <aside className="jiraPanel">
        <div className="jiraPanelHead">
          <span>Jira ticket</span>
          {jiraSnapshot && <button className="textLinkButton" disabled={busy} onClick={resyncJira}>Resync</button>}
        </div>
        {!jiraSnapshot ? (
          <p className="incidentSummary">Not linked to a Jira ticket.</p>
        ) : (
          <div className="jiraPanelBody">
            <strong>{jiraSnapshot.externalKey}</strong>
            <p className="jiraPanelSummary">{jiraSnapshot.summary}</p>
            <div className="jiraPanelMeta">
              <span>{jiraSnapshot.status}</span>
              {jiraSnapshot.priority && <span>{jiraSnapshot.priority}</span>}
              {jiraSnapshot.assigneeName && <span>{jiraSnapshot.assigneeName}</span>}
            </div>
            {jiraSnapshot.labels.length > 0 && (
              <div className="jiraPanelLabels">{jiraSnapshot.labels.map((label) => <span key={label}>{label}</span>)}</div>
            )}
            {jiraSnapshot.description && <p className="jiraPanelDescription">{jiraSnapshot.description}</p>}
            {jiraSnapshot.comments.length > 0 && (
              <div className="jiraPanelComments">
                <small>{jiraSnapshot.comments.length} comment{jiraSnapshot.comments.length === 1 ? '' : 's'}</small>
                {jiraSnapshot.comments.slice(-2).map((comment, index) => (
                  <div key={index} className="jiraComment"><b>{comment.author}</b><p>{comment.body}</p></div>
                ))}
              </div>
            )}
            <small className="jiraPanelSynced">Synced {new Date(jiraSnapshot.fetchedAt).toLocaleString()}</small>
          </div>
        )}
      </aside>
    </div>
  );
}
