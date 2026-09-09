'use client';

import { useOrganization } from '@clerk/nextjs';
import { useEffect, useState } from 'react';

type Member = { userId: string; displayName: string | null; email: string; role: string };
type AuditEvent = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
};
type Project = { id: string; name: string; repository: string; defaultBranch: string; description: string | null };

export default function SettingsPage() {
  const { organization } = useOrganization();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectRepo, setProjectRepo] = useState('');
  const [projectBranch, setProjectBranch] = useState('main');
  const [creatingProject, setCreatingProject] = useState(false);

  const loadProjects = () => {
    fetch('/api/projects')
      .then(async (response) => (await response.json()) as { projects: Project[] })
      .then((payload) => setProjects(payload.projects))
      .catch(() => setProjects([]));
  };

  useEffect(() => {
    fetch('/api/organizations/members')
      .then(async (response) => (await response.json()) as { members: Member[] })
      .then((payload) => setMembers(payload.members))
      .catch(() => setMembers([]));
    fetch('/api/audit-events?limit=100')
      .then(async (response) => (await response.json()) as { events: AuditEvent[] })
      .then((payload) => setEvents(payload.events))
      .catch(() => setEvents([]));
    loadProjects();
  }, []);

  const createProject = async () => {
    if (!projectName.trim() || !projectRepo.trim()) return;
    setCreatingProject(true);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName, repository: projectRepo, defaultBranch: projectBranch || 'main' }),
      });
      if (response.ok) {
        setProjectName('');
        setProjectRepo('');
        setProjectBranch('main');
        setShowCreateProject(false);
        loadProjects();
      }
    } finally {
      setCreatingProject(false);
    }
  };

  const deleteProject = async (id: string) => {
    if (!window.confirm('Delete this project? Incidents linked to it will keep their history but lose the repository link.')) return;
    const response = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    if (response.ok) loadProjects();
  };

  return (
    <div className="appPage settingsPage">
      <h1>Settings</h1>

      <section className="settingsSection">
        <h2>Workspace</h2>
        <div className="settingsCard">
          <div className="settingsRow"><span>Name</span><strong>{organization?.name ?? '—'}</strong></div>
          <div className="settingsRow"><span>Slug</span><strong>{organization?.slug ?? '—'}</strong></div>
          <div className="settingsRow"><span>Members</span><strong>{organization?.membersCount ?? members?.length ?? '—'}</strong></div>
        </div>
      </section>

      <section className="settingsSection">
        <h2>Members</h2>
        {members === null ? (
          <div className="appLoadingSkeleton" aria-hidden="true"><span /></div>
        ) : (
          <div className="settingsCard">
            {members.map((member) => (
              <div key={member.userId} className="settingsRow">
                <span>{member.displayName || member.email}</span>
                <strong className="settingsRole">{member.role}</strong>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="settingsSection">
        <div className="appPageHead">
          <h2>Projects</h2>
          <button className="secondaryButton" onClick={() => setShowCreateProject((value) => !value)}>
            {showCreateProject ? 'Cancel' : 'New project'}
          </button>
        </div>
        <p className="incidentSummary">Real, linked repositories incidents can reference — used as the default branch/target for GitHub actions instead of typing a repo string every time.</p>
        {showCreateProject && (
          <div className="incidentCreateForm">
            <label><span>Name</span><input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="ReproZero AWS Demo" /></label>
            <label><span>Repository (owner/repo or full URL)</span><input value={projectRepo} onChange={(event) => setProjectRepo(event.target.value)} placeholder="Avantiikaa16/ReproZero_AWS_Demo" /></label>
            <label><span>Default branch</span><input value={projectBranch} onChange={(event) => setProjectBranch(event.target.value)} placeholder="main" /></label>
            <button className="primaryButtonSmall" disabled={creatingProject || !projectName.trim() || !projectRepo.trim()} onClick={createProject}>
              {creatingProject ? 'Creating…' : 'Create project'}
            </button>
          </div>
        )}
        {projects === null ? (
          <div className="appLoadingSkeleton" aria-hidden="true"><span /></div>
        ) : projects.length === 0 ? (
          <div className="appEmptyState"><strong>No projects yet</strong><p>Create one above, or keep using free-text repository fields on incidents.</p></div>
        ) : (
          <div className="settingsCard">
            {projects.map((project) => (
              <div key={project.id} className="settingsRow">
                <span>{project.name} <small className="settingsProjectRepo">{project.repository} @ {project.defaultBranch}</small></span>
                <button className="textLinkButton" onClick={() => deleteProject(project.id)}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="settingsSection">
        <h2>Audit log</h2>
        <p className="incidentSummary">Every security-sensitive action in this workspace — integration connects/disconnects, external writes, status and assignment changes.</p>
        {events === null ? (
          <div className="appLoadingSkeleton" aria-hidden="true"><span /><span /><span /></div>
        ) : events.length === 0 ? (
          <div className="appEmptyState"><strong>No audit events yet</strong><p>Actions will appear here as they happen.</p></div>
        ) : (
          <div className="auditLog">
            {events.map((event) => (
              <div key={event.id} className="auditLogRow">
                <span className="auditLogAction">{event.action}</span>
                <span className="auditLogActor">{event.actorName || event.actorEmail || 'System'}</span>
                <span className="auditLogResource">{event.resourceType}</span>
                <span className="auditLogTime">{new Date(event.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
