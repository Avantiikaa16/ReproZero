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

export default function SettingsPage() {
  const { organization } = useOrganization();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);

  useEffect(() => {
    fetch('/api/organizations/members')
      .then(async (response) => (await response.json()) as { members: Member[] })
      .then((payload) => setMembers(payload.members))
      .catch(() => setMembers([]));
    fetch('/api/audit-events?limit=100')
      .then(async (response) => (await response.json()) as { events: AuditEvent[] })
      .then((payload) => setEvents(payload.events))
      .catch(() => setEvents([]));
  }, []);

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
