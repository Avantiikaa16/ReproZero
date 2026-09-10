'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type ShowcaseNote = { type: string; content: string; createdAt: string };
type ShowcaseRun = {
  status: string;
  mode: string;
  createdAt: string;
  result: {
    verdict?: string;
    error?: string;
    codePath?: string[];
    patch?: { file: string; summary: string; diff: string };
    verification?: { before: { state: string; testsPassing: number }; after: { state: string; testsPassing: number }; totalTests: number };
    terminalOutput?: string;
  };
};
type ShowcaseIncident = {
  title: string;
  summary: string | null;
  status: string;
  priority: string | null;
  repository: string | null;
  defaultBranch: string;
  reopenedCount: number;
  createdAt: string;
};

/** "owner/repo" or a full URL → a clean https://github.com/... base, or null. */
function repoUrl(repository: string | null): string | null {
  if (!repository) return null;
  return repository.startsWith('http') ? repository.replace(/\.git$/, '') : `https://github.com/${repository}`;
}

export function ShowcaseClient({ slug }: { slug: string }) {
  const [data, setData] = useState<{ incident: ShowcaseIncident; notes: ShowcaseNote[]; latestRun: ShowcaseRun | null } | 'not_found' | null>(null);

  useEffect(() => {
    fetch(`/api/showcase/${slug}`)
      .then(async (response) => {
        if (response.status === 404) return 'not_found' as const;
        if (!response.ok) throw new Error('Failed to load.');
        return response.json() as Promise<{ incident: ShowcaseIncident; notes: ShowcaseNote[]; latestRun: ShowcaseRun | null }>;
      })
      .then(setData)
      .catch(() => setData('not_found'));
  }, [slug]);

  return (
    <>
      <nav className="nav shell">
        <Link className="brand" href="/"><span className="brandMark">R0</span><span>ReproZero</span></Link>
        <div className="navLinks">
          <Link href="/">Home</Link>
          <Link className="navCta" href="/sign-up">Sign up</Link>
        </div>
      </nav>

      <main className="shell showcasePage">
        {data === null && (
          <div className="appLoadingSkeleton" aria-hidden="true"><span /><span /><span /></div>
        )}

        {data === 'not_found' && (
          <div className="appEmptyState">
            <strong>This incident isn&apos;t public (or doesn&apos;t exist).</strong>
            <p>Whoever shared this link may have made it private again, or mistyped it.</p>
            <Link href="/" className="primaryButtonSmall">Go to ReproZero →</Link>
          </div>
        )}

        {data && data !== 'not_found' && (
          <>
            <p className="showcaseEyebrow">Read-only public example — a real incident reproduced end to end with ReproZero.</p>
            <h1>{data.incident.title}</h1>
            {data.incident.summary && <p className="incidentSummary">{data.incident.summary}</p>}
            <div className="showcaseMeta">
              <span className="appStatusPill live">{data.incident.status}</span>
              {data.incident.priority && <span className="appStatusPill demo">{data.incident.priority}</span>}
              {data.incident.repository &&
                (repoUrl(data.incident.repository) ? (
                  <a href={repoUrl(data.incident.repository)!} target="_blank" rel="noreferrer">
                    {data.incident.repository} →
                  </a>
                ) : (
                  <span>{data.incident.repository}</span>
                ))}
              {data.incident.reopenedCount > 0 && <span>Reopened {data.incident.reopenedCount}×</span>}
            </div>

            {data.latestRun && (
              <div className="runSummaryCard">
                <div className="runSummaryHead">
                  <span className={`appStatusPill ${data.latestRun.mode === 'live_sandbox' ? 'live' : 'demo'}`}>
                    {data.latestRun.mode === 'live_sandbox' ? 'Live sandbox execution' : 'Demo simulation'}
                  </span>
                  <strong>{data.latestRun.status === 'succeeded' ? 'Reproduction verified' : data.latestRun.status === 'failed' ? 'Reproduction not supported yet' : 'Running…'}</strong>
                </div>
                {data.latestRun.status === 'failed' && data.latestRun.result.error && (
                  <p className="runSummaryError">{data.latestRun.result.error}</p>
                )}
                {data.latestRun.status === 'succeeded' && (
                  <>
                    <p className="runSummaryError" style={{ color: '#8fe28f' }}>
                      Verdict: {data.latestRun.result.verdict ?? 'FIX_VERIFIED'}
                    </p>
                    {Array.isArray(data.latestRun.result.codePath) && (
                      <div className="codePathGraph">
                        {data.latestRun.result.codePath.map((entry, index, all) => (
                          <div key={entry} className="codePathNode">
                            <span>{entry}</span>
                            {index < all.length - 1 && <i>↓</i>}
                          </div>
                        ))}
                      </div>
                    )}
                    {data.latestRun.result.verification && (
                      <div className="beforeAfterCompare">
                        <div>
                          <small>Before</small>
                          <strong>{data.latestRun.result.verification.before.state}</strong>
                          <span>{data.latestRun.result.verification.before.testsPassing}/{data.latestRun.result.verification.totalTests} tests passing</span>
                        </div>
                        <i>→</i>
                        <div>
                          <small>After</small>
                          <strong>{data.latestRun.result.verification.after.state}</strong>
                          <span>{data.latestRun.result.verification.after.testsPassing}/{data.latestRun.result.verification.totalTests} tests passing</span>
                        </div>
                      </div>
                    )}
                    {data.latestRun.result.patch && (
                      <div className="patchViewer">
                        <div className="patchViewerHead"><span>{data.latestRun.result.patch.file}</span></div>
                        <p className="incidentSummary">{data.latestRun.result.patch.summary}</p>
                        {repoUrl(data.incident.repository) && (
                          <a
                            className="patchEditLink"
                            href={`${repoUrl(data.incident.repository)}/blob/${data.incident.defaultBranch}/${data.latestRun.result.patch.file}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View {data.latestRun.result.patch.file} on GitHub →
                          </a>
                        )}
                        <pre className="diffViewer">{data.latestRun.result.patch.diff}</pre>
                      </div>
                    )}
                    {data.latestRun.result.terminalOutput && (
                      <details className="terminalViewer">
                        <summary>Terminal output (real sandbox)</summary>
                        <pre>{data.latestRun.result.terminalOutput}</pre>
                      </details>
                    )}
                  </>
                )}
              </div>
            )}

            {data.notes.length > 0 && (
              <div className="incidentNotes">
                <h2>Timeline</h2>
                <div className="noteTimeline">
                  {data.notes.map((note, index) => (
                    <div key={index} className={`noteItem note-${note.type}`}>
                      <small>{note.type} · {new Date(note.createdAt).toLocaleString()}</small>
                      <p>{note.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="showcaseFooterCta">
              <p>This is one real incident from a live ReproZero workspace — evidence intake, sandboxed reproduction, and verification, end to end.</p>
              <Link className="primaryButtonSmall" href="/sign-up">Try it on your own incidents →</Link>
            </div>
          </>
        )}
      </main>

      <footer className="footer shell">
        <Link className="brand" href="/"><span className="brandMark">R0</span><span>ReproZero</span></Link>
        <p>Production evidence -&gt; executable certainty.</p>
      </footer>
    </>
  );
}
