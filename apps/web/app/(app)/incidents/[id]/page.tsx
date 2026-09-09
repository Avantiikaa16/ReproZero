'use client';

import Link from 'next/link';
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
  repository: string | null;
  projectId: string | null;
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
type Member = { userId: string; displayName: string | null; email: string; role: string };
type JiraTransition = { id: string; name: string; to: string };
type PendingWriteback =
  | { action: 'comment'; body: string }
  | { action: 'transition'; transitionId: string; transitionName: string };
type PendingGithubAction =
  | { action: 'create_branch'; branchName: string; baseBranch: string }
  | { action: 'create_pr'; head: string; base: string; title: string; body: string };
type RunResult = {
  verdict?: string;
  error?: string;
  codePath?: string[];
  patch?: { file: string; summary: string; diff: string };
  verification?: { before: { state: string; testsPassing: number }; after: { state: string; testsPassing: number }; totalTests: number };
  terminalOutput?: string;
};
type Project = { id: string; name: string; repository: string; defaultBranch: string };
type SimilarMemory = {
  id: string;
  title: string;
  rootCause: string | null;
  verifiedRepair: string | null;
  incidentId: string | null;
  sharedTerms: string[];
};

export default function IncidentDetailPage() {
  const params = useParams<{ id: string }>();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [jiraSnapshot, setJiraSnapshot] = useState<JiraSnapshot | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [transitions, setTransitions] = useState<JiraTransition[] | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [selectedTransitionId, setSelectedTransitionId] = useState('');
  const [pendingWriteback, setPendingWriteback] = useState<PendingWriteback | null>(null);
  const [writebackError, setWritebackError] = useState<string | null>(null);
  const [similarMemories, setSimilarMemories] = useState<SimilarMemory[]>([]);
  const [githubConnected, setGithubConnected] = useState(false);
  const [branchNameDraft, setBranchNameDraft] = useState('');
  const [prTitleDraft, setPrTitleDraft] = useState('');
  const [prBodyDraft, setPrBodyDraft] = useState('');
  const [prHeadDraft, setPrHeadDraft] = useState('');
  const [pendingGithubAction, setPendingGithubAction] = useState<PendingGithubAction | null>(null);
  const [githubActionError, setGithubActionError] = useState<string | null>(null);
  const [githubActionResultUrl, setGithubActionResultUrl] = useState<string | null>(null);
  const [patchCopied, setPatchCopied] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [projectPickerValue, setProjectPickerValue] = useState('');

  const load = () => {
    fetch(`/api/incidents/${params.id}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Not found');
        return response.json() as Promise<{
          incident: Incident;
          jiraSnapshot: JiraSnapshot | null;
          notes: Note[];
          runs: Run[];
          similarMemories: SimilarMemory[];
          project: Project | null;
        }>;
      })
      .then((payload) => {
        setIncident(payload.incident);
        setSimilarMemories(payload.similarMemories ?? []);
        setJiraSnapshot(payload.jiraSnapshot);
        setNotes(payload.notes);
        setRuns(payload.runs);
        setProject(payload.project);
      })
      .catch(() => setIncident(null));
  };

  useEffect(load, [params.id]);

  useEffect(() => {
    fetch('/api/organizations/members')
      .then(async (response) => (await response.json()) as { members: Member[] })
      .then((payload) => setMembers(payload.members))
      .catch(() => setMembers([]));
    fetch('/api/integrations')
      .then(async (response) => (await response.json()) as { connections: Array<{ provider: string; status: string }> })
      .then((payload) => setGithubConnected(payload.connections.some((c) => c.provider === 'github' && c.status === 'connected')))
      .catch(() => setGithubConnected(false));
    fetch('/api/projects')
      .then(async (response) => (await response.json()) as { projects: Project[] })
      .then((payload) => setAllProjects(payload.projects))
      .catch(() => setAllProjects([]));
  }, []);

  useEffect(() => {
    if (!jiraSnapshot) return;
    fetch(`/api/incidents/${params.id}/jira-transitions`)
      .then(async (response) => (await response.json()) as { transitions: JiraTransition[] })
      .then((payload) => setTransitions(payload.transitions))
      .catch(() => setTransitions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jiraSnapshot?.externalKey]);

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

  const addNote = async (type: 'note' | 'request_info' = 'note') => {
    if (!noteText.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/incidents/${params.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content: noteText }),
      });
      if (response.ok) {
        if (type === 'request_info' && incident?.status !== 'Evidence needed') {
          await fetch(`/api/incidents/${params.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Evidence needed' }),
          });
        }
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

  const confirmWriteback = async () => {
    if (!pendingWriteback) return;
    setBusy(true);
    setWritebackError(null);
    try {
      const response = await fetch(`/api/incidents/${params.id}/jira-writeback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pendingWriteback, confirmed: true }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? 'Failed to write back to Jira.');
      }
      setPendingWriteback(null);
      setCommentDraft('');
      setSelectedTransitionId('');
      load();
    } catch (error) {
      setWritebackError(error instanceof Error ? error.message : 'Failed to write back to Jira.');
    } finally {
      setBusy(false);
    }
  };

  const confirmGithubAction = async () => {
    if (!pendingGithubAction) return;
    setBusy(true);
    setGithubActionError(null);
    setGithubActionResultUrl(null);
    try {
      const response = await fetch(`/api/incidents/${params.id}/github-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pendingGithubAction, confirmed: true }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!response.ok) throw new Error(payload.error ?? 'GitHub action failed.');
      setGithubActionResultUrl(payload.url ?? null);
      setPendingGithubAction(null);
      setBranchNameDraft('');
      setPrTitleDraft('');
      setPrBodyDraft('');
      setPrHeadDraft('');
      load();
    } catch (error) {
      setGithubActionError(error instanceof Error ? error.message : 'GitHub action failed.');
    } finally {
      setBusy(false);
    }
  };

  const linkProject = async () => {
    await updateIncident({ projectId: projectPickerValue || null });
    setShowProjectPicker(false);
  };

  const copyPatch = async (diff: string) => {
    await navigator.clipboard.writeText(diff);
    setPatchCopied(true);
    setTimeout(() => setPatchCopied(false), 1800);
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
          <select
            className="statusSelect"
            value={incident.assigneeId ?? ''}
            disabled={busy}
            onChange={(event) => updateIncident({ assigneeId: event.target.value || null })}
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>{member.displayName || member.email}</option>
            ))}
          </select>
          {incident.status === 'Completed' ? (
            <button className="secondaryButton" disabled={busy} onClick={() => updateIncident({ status: 'New' })}>Reopen</button>
          ) : (
            <button className="primaryButtonSmall" disabled={busy} onClick={() => updateIncident({ status: 'Completed' })}>Mark completed</button>
          )}
          <a className="secondaryButton" href={`/api/incidents/${params.id}/evidence-bundle`}>Download evidence bundle</a>
          {incident.repository && (
            <a
              className="secondaryButton"
              href={incident.repository.startsWith('http') ? incident.repository : `https://github.com/${incident.repository}`}
              target="_blank"
              rel="noreferrer"
            >
              Open repository
            </a>
          )}
        </div>

        {latestRun && (
          <div className="runSummaryCard">
            <div className="runSummaryHead">
              <span className={`appStatusPill ${latestRun.mode === 'live_sandbox' ? 'live' : 'demo'}`}>
                {latestRun.mode === 'live_sandbox' ? 'Live sandbox execution' : 'Demo simulation'}
              </span>
              <strong>{latestRun.status === 'succeeded' ? 'Reproduction verified' : latestRun.status === 'failed' ? 'Reproduction not supported yet' : 'Running…'}</strong>
            </div>
            {latestRun.status === 'failed' && typeof latestRun.result.error === 'string' && (
              <p className="runSummaryError">{latestRun.result.error}</p>
            )}
            {latestRun.status === 'succeeded' && (() => {
              const result = latestRun.result as RunResult;
              return (
                <>
                  <p className="runSummaryError" style={{ color: '#8fe28f' }}>
                    Verdict: {result.verdict ?? 'FIX_VERIFIED'} — see Reproductions for full evidence.
                  </p>
                  {Array.isArray(result.codePath) && (
                    <div className="codePathGraph">
                      {result.codePath.map((entry, index, all) => (
                        <div key={entry} className="codePathNode">
                          <span>{entry}</span>
                          {index < all.length - 1 && <i>↓</i>}
                        </div>
                      ))}
                    </div>
                  )}

                  {result.verification && (
                    <div className="beforeAfterCompare">
                      <div>
                        <small>Before</small>
                        <strong>{result.verification.before.state}</strong>
                        <span>{result.verification.before.testsPassing}/{result.verification.totalTests} tests passing</span>
                      </div>
                      <i>→</i>
                      <div>
                        <small>After</small>
                        <strong>{result.verification.after.state}</strong>
                        <span>{result.verification.after.testsPassing}/{result.verification.totalTests} tests passing</span>
                      </div>
                    </div>
                  )}

                  {result.patch && (
                    <div className="patchViewer">
                      <div className="patchViewerHead">
                        <span>{result.patch.file}</span>
                        <button className="textLinkButton" onClick={() => copyPatch(result.patch!.diff)}>
                          {patchCopied ? '✓ Copied' : 'Copy patch'}
                        </button>
                      </div>
                      <p className="incidentSummary">{result.patch.summary}</p>
                      <pre className="diffViewer">{result.patch.diff}</pre>
                    </div>
                  )}

                  {result.terminalOutput && (
                    <details className="terminalViewer">
                      <summary>Terminal output (real sandbox)</summary>
                      <pre>{result.terminalOutput}</pre>
                    </details>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {similarMemories.length > 0 && (
          <div className="similarMemories">
            <h2>Similar incidents</h2>
            {similarMemories.map((memory) => (
              <div key={memory.id} className="similarMemoryRow">
                <div>
                  <strong>{memory.title}</strong>
                  {memory.verifiedRepair && <p>{memory.verifiedRepair}</p>}
                </div>
                <small>shares: {memory.sharedTerms.join(', ')}</small>
                {memory.incidentId && <Link href={`/incidents/${memory.incidentId}`} className="textLinkButton">View →</Link>}
              </div>
            ))}
          </div>
        )}

        <div className="githubActions">
          <h2>Repository</h2>
          {incident.repository ? (
            <p className="incidentSummary">
              Linked to <b>{project?.name ?? incident.repository}</b>{project && ` — ${project.repository}`}.{' '}
              <button className="textLinkButton" onClick={() => { setProjectPickerValue(incident.projectId ?? ''); setShowProjectPicker((v) => !v); }}>
                Change
              </button>
            </p>
          ) : (
            <p className="incidentSummary">
              No repository linked yet — link a project to enable GitHub branch/PR actions.{' '}
              <button className="textLinkButton" onClick={() => { setProjectPickerValue(''); setShowProjectPicker((v) => !v); }}>
                Link a project
              </button>
            </p>
          )}

          {showProjectPicker && (
            <div className="githubActionRow">
              {allProjects.length === 0 ? (
                <p className="incidentSummary">
                  No projects in this workspace yet. <Link href="/settings">Create one in Settings</Link>, then come back here.
                </p>
              ) : (
                <>
                  <select value={projectPickerValue} onChange={(event) => setProjectPickerValue(event.target.value)}>
                    <option value="">No project (unlink)</option>
                    {allProjects.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>{candidate.name} — {candidate.repository}</option>
                    ))}
                  </select>
                  <button className="primaryButtonSmall" disabled={busy} onClick={linkProject}>Save</button>
                </>
              )}
              <button className="secondaryButton" disabled={busy} onClick={() => setShowProjectPicker(false)}>Cancel</button>
            </div>
          )}

          {incident.repository && (
            <>
              {!githubConnected ? (
                <p className="incidentSummary">
                  GitHub isn&apos;t connected for this workspace. <Link href="/integrations">Connect it</Link> to create branches or open pull requests.
                </p>
              ) : (
                <>
                  <div className="githubActionRow">
                    <input
                      placeholder="New branch name, e.g. fix/dit-1842"
                      value={branchNameDraft}
                      onChange={(event) => setBranchNameDraft(event.target.value)}
                    />
                    <button
                      className="secondaryButton"
                      disabled={busy || !branchNameDraft.trim()}
                      onClick={() => setPendingGithubAction({ action: 'create_branch', branchName: branchNameDraft.trim(), baseBranch: project?.defaultBranch ?? 'main' })}
                    >
                      Preview branch creation
                    </button>
                  </div>
                  <div className="githubActionRow githubPrRow">
                    <input placeholder="Head branch (must already exist)" value={prHeadDraft} onChange={(event) => setPrHeadDraft(event.target.value)} />
                    <input placeholder="PR title" value={prTitleDraft} onChange={(event) => setPrTitleDraft(event.target.value)} />
                  </div>
                  <textarea
                    rows={2}
                    placeholder="PR description (optional)"
                    value={prBodyDraft}
                    onChange={(event) => setPrBodyDraft(event.target.value)}
                  />
                  <button
                    className="secondaryButton"
                    disabled={busy || !prHeadDraft.trim() || !prTitleDraft.trim()}
                    onClick={() => setPendingGithubAction({ action: 'create_pr', head: prHeadDraft.trim(), base: project?.defaultBranch ?? 'main', title: prTitleDraft.trim(), body: prBodyDraft })}
                  >
                    Preview draft pull request
                  </button>
                </>
              )}
              {githubActionResultUrl && (
                <p className="runSummaryError" style={{ color: '#8fe28f' }}>
                  Done — <a href={githubActionResultUrl} target="_blank" rel="noreferrer">view on GitHub →</a>
                </p>
              )}
            </>
          )}
        </div>

        {pendingGithubAction && (
          <div className="writebackConfirm">
            <strong>Confirm GitHub write</strong>
            {pendingGithubAction.action === 'create_branch' ? (
              <p>
                Create branch <b>{pendingGithubAction.branchName}</b> from <b>{pendingGithubAction.baseBranch}</b> on{' '}
                <b>{incident.repository}</b>. This only creates the branch pointer — no files change until you push a commit to it.
              </p>
            ) : (
              <p>
                Open a <b>draft</b> pull request on <b>{incident.repository}</b>: <b>{pendingGithubAction.head}</b> →{' '}
                <b>{pendingGithubAction.base}</b>, titled &ldquo;{pendingGithubAction.title}&rdquo;. This compares whatever commits
                already exist on <b>{pendingGithubAction.head}</b> — it doesn&apos;t push the patch for you.
              </p>
            )}
            {githubActionError && <p className="runSummaryError">{githubActionError}</p>}
            <div className="incidentActionRow">
              <button className="secondaryButton" disabled={busy} onClick={() => { setPendingGithubAction(null); setGithubActionError(null); }}>
                Cancel
              </button>
              <button className="primaryButtonSmall" disabled={busy} onClick={confirmGithubAction}>
                Confirm &amp; write to GitHub
              </button>
            </div>
          </div>
        )}

        <div className="incidentNotes">
          <h2>Timeline</h2>
          <div className="noteComposer">
            <textarea rows={2} placeholder="Add a note, evidence, or update…" value={noteText} onChange={(event) => setNoteText(event.target.value)} />
            <div className="noteComposerActions">
              <button className="primaryButtonSmall" disabled={busy || !noteText.trim()} onClick={() => addNote('note')}>Add</button>
              <button
                className="secondaryButton"
                disabled={busy || !noteText.trim()}
                onClick={() => addNote('request_info')}
                title="Adds this note and moves the incident to 'Evidence needed'"
              >
                Request more evidence
              </button>
            </div>
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

            <div className="jiraWriteback">
              <label>
                <span>Comment on Jira</span>
                <textarea
                  rows={2}
                  placeholder="Write a comment…"
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                />
              </label>
              <button
                className="secondaryButton"
                disabled={busy || !commentDraft.trim()}
                onClick={() => setPendingWriteback({ action: 'comment', body: commentDraft })}
              >
                Preview &amp; post comment
              </button>

              {transitions && transitions.length > 0 && (
                <div className="jiraTransitionRow">
                  <select value={selectedTransitionId} onChange={(event) => setSelectedTransitionId(event.target.value)}>
                    <option value="">Change Jira status…</option>
                    {transitions.map((transition) => (
                      <option key={transition.id} value={transition.id}>{transition.name}</option>
                    ))}
                  </select>
                  <button
                    className="secondaryButton"
                    disabled={busy || !selectedTransitionId}
                    onClick={() => {
                      const transition = transitions.find((candidate) => candidate.id === selectedTransitionId);
                      if (transition) setPendingWriteback({ action: 'transition', transitionId: transition.id, transitionName: transition.name });
                    }}
                  >
                    Preview transition
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {pendingWriteback && jiraSnapshot && (
          <div className="writebackConfirm">
            <strong>Confirm Jira write</strong>
            {pendingWriteback.action === 'comment' ? (
              <p>Post this comment to <b>{jiraSnapshot.externalKey}</b> in Jira:<br /><em>&ldquo;{pendingWriteback.body}&rdquo;</em></p>
            ) : (
              <p>Transition <b>{jiraSnapshot.externalKey}</b> to <b>{pendingWriteback.transitionName}</b> in Jira.</p>
            )}
            {writebackError && <p className="runSummaryError">{writebackError}</p>}
            <div className="incidentActionRow">
              <button className="secondaryButton" disabled={busy} onClick={() => { setPendingWriteback(null); setWritebackError(null); }}>
                Cancel
              </button>
              <button className="primaryButtonSmall" disabled={busy} onClick={confirmWriteback}>
                Confirm &amp; send to Jira
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
