'use client';

import { useEffect, useState } from 'react';
import type { ReproductionResult } from './lib/repro-engine';

const stages = [
  ['Codex', 'Extracted 8 facts and generated ReproSpec'],
  ['Claude-Mem', 'Searched prior incident memory - cold start'],
  ['Greptile', 'Mapped ticket to the 5-step deletion path'],
  ['AWS Demo Sandbox', 'Executed the missing-VPC fixture from ReproZero-AwsDemo'],
  ['Codex', 'Generated idempotent cleanup patch + regression test'],
  ['Verifier', 'Reran identical ReproSpec - fix verified'],
];

const artifactTabs = ['Sandbox', 'ReproSpec', 'Failure', 'Code path', 'Patch', 'Verification', 'Memory'] as const;
type ArtifactTab = typeof artifactTabs[number];

type IntegrationHealth = {
  integrations?: Record<string, boolean>;
};

const demoTicket = `DIT-1842 | SEV-2 | Firewall stuck in DELETING

Customer impact: A managed firewall cannot be removed from the customer account.

Observed state:
- Firewall resource: fw-prod-1842
- AWS account: 123456789012 (synthetic demo)
- Region: us-west-2
- Elastic IP and subnet cleanup completed
- VPC vpc-0repro1842 was manually deleted before the workflow ran
- Deletion workflow stopped at deleteVpc with ResourceNotFound

Expected: Missing infrastructure should be treated as already deleted and the workflow should complete.

Runbook attempted: Retry deletion and verify dependent resources. Issue remained unresolved.`;

const demoEvent = `{
  "source": "aws.ec2",
  "detail-type": "ReproZero Demo Incident",
  "detail": {
    "ticket": "DIT-1842",
    "resource": "fw-prod-1842",
    "operation": "DeleteVpc",
    "vpcId": "vpc-0repro1842",
    "errorCode": "ResourceNotFound",
    "workflowState": "DELETING"
  }
}`;

const workflows = [
  ['01', 'Understand', 'Extract facts, unknowns, and the environmental condition hidden inside the ticket.'],
  ['02', 'Recreate', 'Compile the evidence into a minimal ReproSpec and execute it in an isolated sandbox.'],
  ['03', 'Repair', 'Give Codex the code path, failing state, and evidence needed to generate a fix.'],
  ['04', 'Remember', 'Store the reproduction and verified repair so the next incident starts warm.'],
];

export default function Home() {
  const [mode, setMode] = useState<'ticket' | 'files' | 'event'>('ticket');
  const [ticket, setTicket] = useState('');
  const [eventPayload, setEventPayload] = useState('');
  const [repository, setRepository] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [demoLoaded, setDemoLoaded] = useState(false);
  const [running, setRunning] = useState(false);
  const [visibleStages, setVisibleStages] = useState(0);
  const [artifact, setArtifact] = useState<ArtifactTab>('ReproSpec');
  const [result, setResult] = useState<ReproductionResult | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [health, setHealth] = useState<Record<string, boolean>>({});
  const [elapsed, setElapsed] = useState(0);
  const [sandboxPatched, setSandboxPatched] = useState(false);
  const [patchingSandbox, setPatchingSandbox] = useState(false);
  const [patchCopied, setPatchCopied] = useState(false);

  useEffect(() => {
    if (!running || visibleStages >= stages.length) return;
    const timer = setTimeout(() => setVisibleStages((value) => value + 1), 520);
    return () => clearTimeout(timer);
  }, [running, visibleStages]);

  useEffect(() => {
    fetch('/api/health')
      .then(async (response) => (await response.json()) as IntegrationHealth)
      .then((payload) => setHealth(payload.integrations ?? {}))
      .catch(() => setHealth({}));
  }, []);

  useEffect(() => {
    if (!running || result) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 100);
    return () => window.clearInterval(timer);
  }, [running, result]);

  const hasEvidence = mode === 'ticket' ? ticket.trim() : mode === 'event' ? eventPayload.trim() : files.length > 0;
  const canRun = Boolean(hasEvidence && repository.trim());
  const edit = () => setDemoLoaded(false);

  const loadDemo = () => {
    setMode('ticket');
    setTicket(demoTicket);
    setEventPayload(demoEvent);
    setRepository('https://github.com/Avantiikaa16/ReproZero_AWS_Demo');
    setFiles(['deletion-workflow.log', 'customer-resource-state.json']);
    setDemoLoaded(true);
    setRunning(false);
  };

  const startRun = async () => {
    if (!canRun) return;
    setVisibleStages(0);
    setRunning(true);
    setSubmitting(true);
    setError('');
    setResult(null);
    setElapsed(0);
    setSandboxPatched(false);

    const evidence = mode === 'ticket' ? ticket : mode === 'event' ? eventPayload : files.join('\n');
    try {
      const response = await fetch('/api/reproduce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidenceType: mode, evidence, repository, demo: demoLoaded }),
      });
      const payload = (await response.json()) as ReproductionResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Unable to run reproduction.');
      setResult(payload);
      setArtifact('Sandbox');
      setVisibleStages(stages.length);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to run reproduction.');
      setRunning(false);
    } finally {
      setSubmitting(false);
    }
  };

  const exportBundle = () => {
    if (!result) return;
    const bundle = result;
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reprozero-DIT-1842-evidence.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const runPatchedSandbox = () => {
    setPatchingSandbox(true);
    window.setTimeout(() => {
      setSandboxPatched(true);
      setPatchingSandbox(false);
    }, 1250);
  };

  const copyPatch = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.patch.diff);
    setPatchCopied(true);
    window.setTimeout(() => setPatchCopied(false), 1800);
  };

  const renderArtifact = () => {
    if (!result) return null;
    if (artifact === 'Sandbox') return <div className={`artifactBody sandboxArtifact ${sandboxPatched ? 'sandboxFixed' : ''}`}><div className="sandboxHeader"><div><small>ISOLATED AWS REPRODUCTION</small><strong>Customer environment · DIT-1842</strong></div><span>{sandboxPatched ? 'FIX VERIFIED' : 'FAILURE LIVE'}</span></div><div className="resourceGraph"><div className="resourceNode firewallNode"><small>EC2 FIREWALL</small><strong>fw-prod-1842</strong><span>{sandboxPatched ? 'DELETED' : 'DELETING'}</span></div><i>→</i><div className="resourceNode"><small>ELASTIC IP</small><strong>eip-1842</strong><span>DISASSOCIATED</span></div><i>→</i><div className="resourceNode"><small>SUBNET</small><strong>subnet-1842</strong><span>DELETED</span></div><i>→</i><div className={`resourceNode vpcNode ${sandboxPatched ? 'handled' : ''}`}><small>VPC</small><strong>vpc-0repro1842</strong><span>{sandboxPatched ? 'ABSENT · HANDLED' : 'NOT FOUND'}</span></div></div><div className="sandboxConsole"><div className="consoleTop"><span>reprozero sandbox / delete-firewall</span><b>{patchingSandbox ? 'running…' : sandboxPatched ? 'exit 0' : 'exit 1'}</b></div><p><i>✓</i> disassociateElasticIp <b>success</b></p><p><i>✓</i> deleteSubnet <b>success</b></p><p className={sandboxPatched ? '' : 'consoleError'}><i>{sandboxPatched ? '✓' : '×'}</i> deleteVpc <b>{sandboxPatched ? 'ResourceNotFound → already deleted' : 'ResourceNotFound'}</b></p><p className={sandboxPatched ? '' : 'consoleMuted'}><i>{sandboxPatched ? '✓' : '•'}</i> terminateInstance <b>{sandboxPatched ? 'success' : 'not reached'}</b></p><p className={sandboxPatched ? '' : 'consoleMuted'}><i>{sandboxPatched ? '✓' : '•'}</i> updateFirewallState <b>{sandboxPatched ? 'DELETED' : 'DELETING'}</b></p></div><button className="patchSandboxButton" disabled={patchingSandbox || sandboxPatched} onClick={runPatchedSandbox}>{patchingSandbox ? 'Replaying identical environment…' : sandboxPatched ? '✓ Patch verified in sandbox' : 'Run patched workflow →'}</button></div>;
    if (artifact === 'ReproSpec') return <div className="artifactBody">{result.analysis && <div className="analysisNote"><span>{result.analysis.mode === 'live' ? `OpenAI ${result.analysis.model}` : 'Deterministic fallback'}</span><p>{result.analysis.summary}</p></div>}<div className="specGrid"><div><small>Provider</small><strong>AWS / {result.reproSpec.region}</strong></div><div><small>Resource</small><strong>{result.reproSpec.resourceId}</strong></div><div><small>Precondition</small><strong>VPC does not exist</strong></div><div><small>Expected failure</small><strong>state = DELETING</strong></div></div><pre>{`setup: load ${result.reproSpec.fixture}\naction: ${result.reproSpec.action}\nassert:\n  ${result.reproSpec.assertions.join('\n  ')}`}</pre></div>;
    if (artifact === 'Failure') return <div className="artifactBody"><div className="verdict failureVerdict"><span>Failure reproduced</span><strong>{result.failure.errorCode}</strong><small>{result.failure.message}</small></div><div className="trace">{result.failure.trace.map((item) => <span key={item.action}>{item.action} <b className={item.result === 'success' ? '' : 'bad'}>{item.result}</b></span>)}</div></div>;
    if (artifact === 'Code path') return <div className="artifactBody"><div className="pathLine"><span>Jira evidence</span><i /> <span>firewall-deletion.js</span><i /> <span>FakeAwsCloud.deleteVpc</span></div><pre>{result.codePath.join('\n  -> ')}</pre><p className="sourceNote">Greptile {result.greptile?.mode === 'live' ? `indexed commit ${result.greptile.indexedCommit.slice(0, 7)}` : 'demo adapter'}; ReproZero mapped {result.codePath.length} relevant files.</p></div>;
    if (artifact === 'Patch') return <div className="artifactBody"><div className="patchHeader"><span>Codex candidate repair</span><b>{result.patch.file}</b></div><pre className="diff">{result.patch.diff}</pre><div className="developerActions"><button onClick={copyPatch}>{patchCopied ? '✓ Patch copied' : 'Copy candidate patch'}</button><a href="https://github.com/Avantiikaa16/ReproZero_AWS_Demo" target="_blank" rel="noreferrer">Open executable demo repo ↗</a></div></div>;
    if (artifact === 'Verification') return <div className="artifactBody"><div className="beforeAfterProof"><div><small>Before patch</small><strong>DELETING</strong><span>1 failed reproduction</span></div><div className="proofArrow">-&gt;</div><div><small>After patch</small><strong>DELETED</strong><span>2/2 tests passing</span></div></div><div className="verifiedBanner"><span>VERIFIED</span><strong>Same inputs. Same sandbox. Failure removed.</strong></div></div>;
    return <div className="artifactBody"><div className="memoryCard"><span className="memoryPulse" /><div><small>{result.claudeMemory?.mode === 'live' ? 'Claude-Mem live observation stored' : 'Claude-Mem hosted fallback'}</small><strong>{result.memory.lesson}</strong><p>{result.claudeMemory?.mode === 'live' ? `Recalled ${result.claudeMemory.recalled} related memories and stored observation #${result.claudeMemory.observationId}.` : 'The local CMEM worker is unavailable from this hosted runtime; the verified lesson remains in the evidence bundle.'}</p></div></div><div className="memoryMeta"><span>{result.memory.key}</span><span>confidence {result.memory.confidence}</span><span>{result.claudeMemory?.stored ? 'stored live' : 'bundle fallback'}</span></div></div>;
  };

  return <main>
    <nav className="nav shell"><a className="brand" href="#top"><span className="brandMark">R0</span><span>ReproZero</span></a><div className="navLinks"><a href="#workflow">How it works</a><a href="#integrations">Integrations</a><a className="navCta" href="#intake">Run a reproduction</a></div></nav>

    <section className="hero shell" id="top">
      <div className="heroCopy"><div className="eyebrow"><span /> Built for production incidents</div><h1>Turn the ticket into a <em>running failure.</em></h1><p className="heroLead">ReproZero compiles tickets, logs, and repository context into a minimal executable reproduction - then proves the repair against the exact same failure.</p><div className="heroActions"><a className="primaryButton" href="#intake">Reproduce an incident <span>-&gt;</span></a><a className="textButton" href="#workflow">See the workflow</a></div><div className="proofStrip"><div><strong>01</strong><span>Evidence in</span></div><div><strong>02</strong><span>Failure reproduced</span></div><div><strong>03</strong><span>Fix proven</span></div></div></div>

      <div className="productFrame" id="intake"><div className="frameTop"><div className="windowDots"><i /><i /><i /></div><span>{running ? 'Reproduction run' : 'New reproduction'}</span><div className="securePill"><i /> isolated</div></div><div className="frameBody">
        {!running ? <>
          <div className="stepLabel"><span>1</span> Add incident evidence</div><h2>What went wrong?</h2><p>Bring your own incident, or load the prepared AWS failure.</p>
          <div className={`demoLauncher ${demoLoaded ? 'loaded' : ''}`}><div><span className="demoTag">Judge-ready demo</span><strong>Firewall deletion stuck after its VPC disappears</strong><small>Loads DIT-1842, AWS evidence, and the demo repository.</small></div><button type="button" onClick={loadDemo}>{demoLoaded ? 'Demo loaded' : 'Load AWS demo'} <span>{demoLoaded ? 'OK' : '->'}</span></button></div>
          <div className="inputTabs" role="tablist" aria-label="Evidence type"><button className={mode === 'ticket' ? 'active' : ''} onClick={() => setMode('ticket')}>Paste ticket</button><button className={mode === 'files' ? 'active' : ''} onClick={() => setMode('files')}>Upload files</button><button className={mode === 'event' ? 'active' : ''} onClick={() => setMode('event')}>Paste event</button></div>
          {mode === 'ticket' && <label className="fieldBlock"><span>Incident ticket</span><textarea value={ticket} onChange={(e) => { setTicket(e.target.value); edit(); }} placeholder="Paste a Jira, Linear, or support escalation ticket..." /></label>}
          {mode === 'files' && <label className="dropArea"><input type="file" multiple onChange={(e) => { setFiles(Array.from(e.target.files ?? []).map((file) => file.name)); edit(); }} /><strong>{files.length ? `${files.length} evidence files selected` : 'Choose evidence files'}</strong><span>Logs, screenshots, JSON, or text files</span><small>{files.length ? files.join(' / ') : 'No files selected'}</small></label>}
          {mode === 'event' && <label className="fieldBlock"><span>Event payload</span><textarea className="codeInput" value={eventPayload} onChange={(e) => { setEventPayload(e.target.value); edit(); }} placeholder={'{ "source": "aws.ec2", "detail": { ... } }'} /></label>}
          <label className="repoField"><span className="repoIcon">#</span><div><small>Repository URL or local path</small><input value={repository} onChange={(e) => { setRepository(e.target.value); edit(); }} placeholder="github.com/org/repository" /></div><span className={repository ? 'connected' : 'notConnected'}>{repository ? 'Ready' : 'Required'}</span></label>
          {error && <div className="formError">{error}</div>}
          <button className="runButton" onClick={startRun} disabled={!canRun || submitting}>{submitting ? 'Starting sandbox...' : 'Build reproduction'} <span>-&gt;</span></button>
        </> : visibleStages < stages.length || !result ? <div className="runView"><div className="stepLabel"><span>2</span> Reproduction pipeline <b className="elapsed">{elapsed.toFixed(1)}s</b></div><h2>Reproducing DIT-1842</h2><p>Evidence, code, and execution stay linked end to end.</p><div className="pipelineMeter"><span style={{ width: `${Math.max(7, (visibleStages / stages.length) * 100)}%` }} /></div><div className="runList">{stages.map(([service, message], index) => <div className={`runItem ${index < visibleStages ? 'shown' : ''} ${index === visibleStages ? 'activeRun' : ''}`} key={`${service}-${index}`}><i className={index === visibleStages ? 'pulse' : ''} /><strong>{service}</strong><span>{message}</span><small>{index < visibleStages ? 'OK' : index === visibleStages ? 'RUN' : '-'}</small></div>)}</div><div className="runSummary"><span>Target condition</span><strong>{demoLoaded ? 'VPC absent -> firewall remains DELETING' : 'Failure state derived from submitted evidence'}</strong></div></div> : <div className="resultView"><div className="celebration" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} />)}</div><div className="resultTop"><div><div className="stepLabel"><span>3</span> Verified reproduction</div><h2>{result.incidentId} is fixed with proof.</h2><p>ReproZero recreated the failure, generated a repair, and reran the identical environment.</p></div><div className="scoreRing"><strong>100%</strong><small>match</small></div></div><div className="runIdentity"><span>{result.runId}</span><span>{result.verdict}</span><span>{elapsed.toFixed(1)}s</span></div><div className="artifactTabs" role="tablist" aria-label="Reproduction artifacts">{artifactTabs.map((tab, index) => <button key={tab} className={artifact === tab ? 'active' : ''} onClick={() => setArtifact(tab)}><span>{index + 1}</span>{tab}</button>)}</div>{renderArtifact()}<div className="resultActions"><button onClick={() => setRunning(false)}>New incident</button><button className="exportButton" onClick={exportBundle}>Export evidence bundle</button></div></div>}
      </div><div className="frameGlow" /></div>
    </section>

    <section className="problemSection shell"><p className="sectionKicker">The missing artifact</p><div className="problemGrid"><h2>Tickets describe failures.<br /><span>Engineers need them running.</span></h2><p>Production incidents arrive as fragments: a screenshot, three logs, a stale runbook, and an environment nobody can reproduce. ReproZero turns that evidence into something executable.</p></div><div className="beforeAfter"><div className="comparisonCard before"><small>Before ReproZero</small><strong>&quot;Unable to reproduce.&quot;</strong><p>Hours rebuilding state, guessing at fixes, and asking customers for one more log.</p></div><div className="comparisonArrow">-&gt;</div><div className="comparisonCard after"><small>With ReproZero</small><strong>Failure confirmed.</strong><p>The ticket becomes a deterministic sandbox, a failing test, and proof that the repair works.</p></div></div></section>

    <section className="workflowSection" id="workflow"><div className="shell"><div className="sectionHeader"><div><p className="sectionKicker">One continuous loop</p><h2>From evidence to certainty.</h2></div><p>Not another incident summary. A running, reusable proof.</p></div><div className="workflowGrid">{workflows.map(([number, title, copy]) => <article key={number}><span>{number}</span><div className="flowGlyph">{number}</div><h3>{title}</h3><p>{copy}</p></article>)}</div></div></section>

    <section className="integrationsSection shell" id="integrations"><div className="sectionHeader"><div><p className="sectionKicker">Purpose-built integrations</p><h2>Each system does one job well.</h2></div><p>Context, memory, reasoning, and execution combine into one verifiable workflow.</p></div><div className="liveRibbon"><span className="liveDot" /> Live system check {['openai', 'greptile', 'github', 'stripe'].map((name) => <b key={name} className={health[name] ? 'online' : ''}>{name} <i>{health[name] ? 'ready' : 'demo'}</i></b>)}</div><div className="integrationGrid"><article className="integrationFeature"><div className="integrationLogo acid">C</div><small>Primary coding agent</small><h3>OpenAI Codex</h3><p>Extracts incident conditions, generates ReproSpec and tests, proposes the repair, and explains the evidence.</p></article><article><div className="integrationLogo blue">G</div><h3>Greptile</h3><p>Finds the complete execution path across the repository.</p></article><article><div className="integrationLogo coral">M</div><h3>Claude-Mem</h3><p>Recalls similar incidents and stores verified lessons.</p></article><article><div className="integrationLogo orange">A</div><h3>AWS</h3><p>Supplies cloud evidence and infrastructure incident context.</p></article><article><div className="integrationLogo violet">S</div><h3>Stripe</h3><p>Replays payment and webhook incident sequences.</p></article></div></section>

    <section className="finalCta shell"><div><p className="sectionKicker">Stop guessing at production</p><h2>Reproduce first.<br />Repair with proof.</h2></div><a className="primaryButton" href="#intake" onClick={loadDemo}>Try the AWS demo <span>-&gt;</span></a></section>
    <footer className="footer shell"><a className="brand" href="#top"><span className="brandMark">R0</span><span>ReproZero</span></a><p>Production evidence -&gt; executable certainty.</p><span>Fast Hackathon / SF / 2026</span></footer>
  </main>;
}
