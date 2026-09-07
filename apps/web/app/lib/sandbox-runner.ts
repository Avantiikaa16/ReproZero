import 'server-only';
import { Sandbox } from '@vercel/sandbox';

// Pinned to the demo repo's only commit — "checkout a pinned commit"
// (Phase 5) so every run is reproducible and auditable, not "whatever main
// happens to be" at execution time.
const AWS_DEMO_REPO_URL = 'https://github.com/Avantiikaa16/ReproZero_AWS_Demo.git';
const AWS_DEMO_PINNED_COMMIT = '5a30ec6c5acb03da8867f16d622f0933b7d631a8';

export type SandboxCommandOutcome = {
  cmd: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

/**
 * Runs a sequence of commands in one fresh, isolated Vercel Sandbox
 * microVM cloned from a pinned commit, then always stops and deletes it —
 * even on failure — so nothing leaks against the account's quota. No
 * credentials of any kind are injected into this sandbox; the AWS demo
 * repo's tests are entirely self-contained against an in-memory fake AWS
 * client, so there is nothing to redact from its output either.
 */
async function runInFreshSandbox(input: {
  repoUrl: string;
  revision: string;
  commands: Array<{ cmd: string; args: string[] }>;
  timeoutMs?: number;
}): Promise<SandboxCommandOutcome[]> {
  const sandbox = await Sandbox.create({
    source: { type: 'git', url: input.repoUrl, revision: input.revision, depth: 1 },
    timeout: input.timeoutMs ?? 5 * 60 * 1000,
    resources: { vcpus: 1 },
  });

  // git clone creates a subdirectory named after the repo (verified by
  // direct inspection — sandbox.cwd itself is one level up, e.g.
  // "/vercel", not the clone target), so commands need that exact path.
  const repoName = input.repoUrl.replace(/\.git$/, '').split('/').pop();
  const repoDir = `${sandbox.cwd}/${repoName}`;

  try {
    const outcomes: SandboxCommandOutcome[] = [];
    for (const command of input.commands) {
      const startedAt = Date.now();
      const result = await sandbox.runCommand({ cmd: command.cmd, args: command.args, cwd: repoDir });
      outcomes.push({
        cmd: command.cmd,
        args: command.args,
        exitCode: result.exitCode,
        stdout: await result.stdout(),
        stderr: await result.stderr(),
        durationMs: Date.now() - startedAt,
      });
    }
    return outcomes;
  } finally {
    await sandbox.stop().catch(() => {});
    await sandbox.delete().catch(() => {});
  }
}

export type LiveAwsVerification = {
  verdict: 'FIX_VERIFIED' | 'UNVERIFIED';
  before: {
    error: { code: string; message: string } | null;
    firewall: { state: string };
    trace: Array<{ action: string; resourceId: string; result: string }>;
  };
  after: {
    error: { code: string; message: string } | null;
    firewall: { state: string };
    trace: Array<{ action: string; resourceId: string; result: string }>;
  };
  testsPassing: number;
  totalTests: number;
  rawVerifyOutput: string;
  rawTestOutput: string;
};

/**
 * Actually clones the AWS demo repo into an isolated microVM, installs its
 * (zero, in practice) dependencies, runs its real regression tests, and
 * runs its real before/after verification script — genuine execution, not
 * a simulation. Throws if any step fails unexpectedly; the caller is
 * responsible for falling back to the deterministic demo engine and
 * labeling the run as such.
 */
export async function runAwsFirewallDeletionInSandbox(): Promise<LiveAwsVerification> {
  const [install, test, verify] = await runInFreshSandbox({
    repoUrl: AWS_DEMO_REPO_URL,
    revision: AWS_DEMO_PINNED_COMMIT,
    commands: [
      { cmd: 'npm', args: ['install'] },
      { cmd: 'npm', args: ['test'] },
      { cmd: 'npm', args: ['run', 'verify'] },
    ],
  });

  if (install.exitCode !== 0) {
    throw new Error(`Sandbox dependency install failed (exit ${install.exitCode}): ${install.stderr.slice(0, 500)}`);
  }
  if (verify.exitCode !== 0) {
    throw new Error(`Sandbox verification script failed (exit ${verify.exitCode}): ${verify.stderr.slice(0, 500)}`);
  }

  const parsed = JSON.parse(verify.stdout) as Omit<LiveAwsVerification, 'testsPassing' | 'totalTests' | 'rawVerifyOutput' | 'rawTestOutput'>;

  // Node's built-in test runner prints a TAP-ish summary; parse the real
  // pass/total counts rather than assuming a fixed number.
  const passMatch = test.stdout.match(/# pass (\d+)/);
  const totalMatch = test.stdout.match(/# tests (\d+)/);

  return {
    ...parsed,
    testsPassing: passMatch ? Number(passMatch[1]) : 0,
    totalTests: totalMatch ? Number(totalMatch[1]) : 0,
    rawVerifyOutput: verify.stdout,
    rawTestOutput: test.stdout,
  };
}
