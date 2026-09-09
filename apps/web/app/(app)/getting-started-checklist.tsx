'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Connection = { provider: string; status: string };

const DISMISS_KEY = 'reprozero_getting_started_dismissed';

/**
 * Shown on Overview — the landing page right after sign-up/sign-in (see
 * signUpFallbackRedirectUrl in clerk-provider.tsx) — since that's the one
 * place every new workspace member is guaranteed to pass through. Answers
 * "what do I do first" concretely rather than leaving it to be guessed:
 * connect an integration, get an incident in, run a reproduction. Persists
 * dismissal in localStorage (this browser only, not workspace-wide) using
 * the same SSR-safe effect-based pattern as the marketing page's preview
 * banner — a lazy useState initializer here would read localStorage during
 * server rendering and mismatch the client, so the dismissed state starts
 * false and is corrected in an effect instead.
 */
export function GettingStartedChecklist() {
  const [dismissed, setDismissed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [incidentCount, setIncidentCount] = useState(0);
  const [runCount, setRunCount] = useState(0);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === '1') {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from a browser-only API after mount, not derivable during render
        setDismissed(true);
      }
    } catch {
      // Private browsing / storage blocked — just don't persist dismissal.
    }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/integrations').then((r) => r.json()) as Promise<{ connections: Connection[] }>,
      fetch('/api/incidents').then((r) => r.json()) as Promise<{ incidents: unknown[] }>,
      fetch('/api/reproduction-runs').then((r) => r.json()) as Promise<{ runs: unknown[] }>,
    ])
      .then(([integrationsPayload, incidentsPayload, runsPayload]) => {
        setConnections(integrationsPayload.connections ?? []);
        setIncidentCount(incidentsPayload.incidents?.length ?? 0);
        setRunCount(runsPayload.runs?.length ?? 0);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Ignore — dismissal just won't stick across reloads.
    }
  };

  const hasConnection = connections.some((c) => c.status === 'connected');
  const steps = [
    { done: hasConnection, label: 'Connect Jira or GitHub', href: '/integrations', hint: 'Optional, but incidents can auto-import from Jira and open real branches/PRs once connected.' },
    { done: incidentCount > 0, label: 'Create or import your first incident', href: '/incidents', hint: 'Manually, or by importing a Jira ticket if connected.' },
    { done: runCount > 0, label: 'Run a reproduction', href: incidentCount > 0 ? '/incidents' : '/incidents', hint: 'Open an incident and click "Run reproduction" to see evidence, verdict, and patch.' },
  ];
  const allDone = steps.every((step) => step.done);

  if (!loaded || dismissed) return null;

  // Rendering nothing at all here used to be indistinguishable from the
  // checklist never having existed — confusing for anyone (including you)
  // checking whether it's actually built. A workspace that already has a
  // connection, an incident, and a run completed every step; leaving a
  // small confirmation instead of vanishing entirely makes that legible.
  if (allDone) {
    return (
      <div className="gettingStartedCard gettingStartedDone">
        <span>✓ Getting started — all set.</span>
        <button className="textLinkButton" onClick={dismiss} aria-label="Dismiss getting started checklist">Dismiss</button>
      </div>
    );
  }

  return (
    <div className="gettingStartedCard">
      <div className="gettingStartedHead">
        <strong>Getting started</strong>
        <button className="textLinkButton" onClick={dismiss} aria-label="Dismiss getting started checklist">Dismiss</button>
      </div>
      <ol className="gettingStartedList">
        {steps.map((step) => (
          <li key={step.label} className={step.done ? 'done' : undefined}>
            <span className="gettingStartedCheck" aria-hidden="true">{step.done ? '✓' : ''}</span>
            <div>
              <Link href={step.href}>{step.label}</Link>
              <small>{step.hint}</small>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
