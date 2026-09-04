'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Connection = {
  id: string;
  provider: string;
  displayName: string;
  status: 'pending' | 'connected' | 'error' | 'disabled';
  config: { siteUrl?: string; siteName?: string };
  lastSyncedAt: string | null;
};

const CALLBACK_MESSAGES: Record<string, string> = {
  jira_missing_code: 'Jira did not return an authorization code. Try connecting again.',
  jira_invalid_state: 'That connection attempt looked tampered with and was rejected.',
  jira_state_mismatch: 'That connection attempt could not be verified and was rejected.',
  jira_session_mismatch: 'Your session changed during the Jira connection. Try again.',
  jira_no_accessible_site: 'Your Jira account has no accessible sites for this app to use.',
  jira_connect_failed: 'Connecting to Jira failed. Try again, or check the app credentials.',
};

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<div className="appPage"><h1>Integrations</h1></div>}>
      <IntegrationsPageContent />
    </Suspense>
  );
}

function IntegrationsPageContent() {
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [busy, setBusy] = useState(false);
  // Derived once from the initial URL, not set from an effect — the OAuth
  // callback redirect carries ?connected=jira or ?error=... only on the
  // very first render after it lands here.
  const [banner, setBanner] = useState<{ tone: 'success' | 'error'; text: string } | null>(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected === 'jira') return { tone: 'success', text: 'Jira connected successfully.' };
    if (error) return { tone: 'error', text: CALLBACK_MESSAGES[error] ?? 'Something went wrong connecting Jira.' };
    return null;
  });

  const load = () => {
    fetch('/api/integrations')
      .then(async (response) => (await response.json()) as { connections: Connection[] })
      .then((payload) => setConnections(payload.connections))
      .catch(() => setConnections([]));
  };

  useEffect(load, []);

  const jira = connections?.find((connection) => connection.provider === 'jira');

  const disconnectJira = async () => {
    if (!window.confirm('Disconnect Jira? Incidents already imported will keep their history, but new ticket sync will stop until you reconnect.')) return;
    setBusy(true);
    try {
      const response = await fetch('/api/integrations/jira/disconnect', { method: 'POST' });
      if (!response.ok) throw new Error('Disconnect failed.');
      setBanner({ tone: 'success', text: 'Jira disconnected.' });
      load();
    } catch {
      setBanner({ tone: 'error', text: 'Failed to disconnect Jira. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="appPage">
      <h1>Integrations</h1>

      {banner && (
        <div className={`appBanner ${banner.tone}`}>
          {banner.text}
          <button onClick={() => setBanner(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {connections === null ? (
        <div className="appLoadingSkeleton" aria-hidden="true"><span /><span /><span /></div>
      ) : (
        <div className="integrationCards">
          <div className="integrationCard">
            <div className="integrationCardHead">
              <div className="jiraBadge">J</div>
              <div>
                <strong>Jira</strong>
                <small>Import tickets as ReproZero incidents via OAuth — no API tokens shared.</small>
              </div>
              <span className={`appStatusPill ${jira?.status === 'connected' ? 'live' : jira?.status === 'error' ? 'error' : 'demo'}`}>
                {jira?.status === 'connected' ? 'Connected' : jira?.status === 'error' ? 'Error' : jira?.status === 'disabled' ? 'Disconnected' : 'Not connected'}
              </span>
            </div>
            {jira?.status === 'connected' && (
              <p className="integrationCardMeta">
                {jira.config.siteName ?? jira.config.siteUrl}
                {jira.lastSyncedAt && ` · connected ${new Date(jira.lastSyncedAt).toLocaleDateString()}`}
              </p>
            )}
            <div className="integrationCardActions">
              {jira?.status === 'connected' ? (
                <button className="secondaryButton" disabled={busy} onClick={disconnectJira}>Disconnect</button>
              ) : (
                <a className="primaryButtonSmall" href="/api/integrations/jira/connect">Connect Jira</a>
              )}
            </div>
          </div>

          <div className="integrationCard muted">
            <div className="integrationCardHead">
              <div className="jiraBadge grey">?</div>
              <div>
                <strong>More adapters</strong>
                <small>Linear, PagerDuty, and other evidence sources plug into the same generic connection registry.</small>
              </div>
              <span className="appStatusPill demo">Planned</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
