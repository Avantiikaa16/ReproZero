'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState } from '../empty-state';

type Run = {
  id: string;
  incidentId: string;
  incidentTitle: string;
  mode: string;
  status: string;
  result: { verdict?: string; error?: string };
  createdAt: string;
};

export default function ReproductionsPage() {
  const [runs, setRuns] = useState<Run[] | null>(null);

  useEffect(() => {
    fetch('/api/reproduction-runs')
      .then(async (response) => (await response.json()) as { runs: Run[] })
      .then((payload) => setRuns(payload.runs))
      .catch(() => setRuns([]));
  }, []);

  return (
    <div className="appPage">
      <h1>Reproductions</h1>

      {runs === null ? (
        <div className="appLoadingSkeleton" aria-hidden="true"><span /><span /><span /></div>
      ) : runs.length === 0 ? (
        <EmptyState
          title="No reproduction runs yet"
          body="Run a reproduction from any incident's workspace — every run (demo simulation or, eventually, live sandbox) will show up here with its outcome and evidence."
        />
      ) : (
        <div className="incidentTable runsTable">
          <div className="incidentTableHead">
            <span>Incident</span><span>Mode</span><span>Outcome</span><span>Started</span>
          </div>
          {runs.map((run) => (
            <Link key={run.id} href={`/incidents/${run.incidentId}`} className="incidentTableRow">
              <span className="incidentTitle">{run.incidentTitle}</span>
              <span className="appStatusPill demo">{run.mode === 'live_sandbox' ? 'Live sandbox' : 'Demo simulation'}</span>
              <span className={run.status === 'succeeded' ? 'runOutcomeOk' : run.status === 'failed' ? 'runOutcomeFail' : ''}>
                {run.status === 'succeeded' ? (run.result.verdict ?? 'Verified') : run.status === 'failed' ? 'Not supported' : run.status}
              </span>
              <span>{new Date(run.createdAt).toLocaleString()}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
