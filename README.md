# ReproZero

> **Tickets describe failures. ReproZero makes them run.**

[Live demo](https://reprozero.vercel.app/) · [Executable AWS demo repository](https://github.com/Avantiikaa16/ReproZero_AWS_Demo)

![ReproZero — turn production incidents into executable reproductions](apps/web/public/og.png)

ReproZero turns incomplete production-incident evidence into a deterministic reproduction, connects the failure to the relevant code path, proposes a candidate repair, and verifies that repair against the same environment.

Instead of leaving an engineer with a Jira ticket and the phrase *“unable to reproduce,”* ReproZero produces the artifacts needed to start fixing the problem:

- A structured **ReproSpec** with preconditions, actions, and assertions
- A visual, deterministic **reproduction sandbox**
- The relevant repository **code path**
- A Codex-generated **candidate patch**
- Before-and-after **verification evidence**
- Reusable **incident memory** for future tickets

## Why ReproZero?

Production incidents rarely arrive as clean test cases. They arrive as fragments: screenshots, partial logs, resource IDs, stale runbooks, support notes, and an environment the developer cannot access.

ReproZero converts those fragments into a portable failing test.

```text
Incident evidence
      ↓
Structured ReproSpec
      ↓
Deterministic sandbox
      ↓
Failure reproduced
      ↓
Candidate repair
      ↓
Same sandbox rerun
      ↓
Fix verified
```

## Demo incident: DIT-1842

The included demonstration is based on a real class of infrastructure incident: a managed firewall becomes stuck in `DELETING` after a dependent VPC is manually removed.

The deletion workflow successfully cleans up the Elastic IP and subnet, then calls `deleteVpc`. AWS returns `ResourceNotFound`; the workflow stops before instance termination and never advances the firewall to `DELETED`.

```text
EC2 firewall     Elastic IP        Subnet            VPC
DELETING    →    DISASSOCIATED  →  DELETED      →    NOT FOUND
                                                       ↓
                                             ResourceNotFound
                                                       ↓
                                          workflow exits with code 1
```

ReproZero proposes an idempotent cleanup behavior: an already-absent dependency is treated as successfully deleted, while unexpected errors are still rethrown. The same environment is replayed, cleanup completes, and the firewall reaches `DELETED`.

## Judge-ready walkthrough

1. Open the [live application](https://reprozero.vercel.app/).
2. Select **Load AWS demo**.
3. Select **Build reproduction** and watch the agent pipeline.
4. In **Sandbox**, inspect the missing-VPC failure and `exit 1` trace.
5. Review **Code path** and the Codex-generated **Patch**.
6. Select **Run patched workflow**.
7. Confirm `exit 0`, `FIX VERIFIED`, and firewall state `DELETED`.
8. Open **Memory** or export the complete evidence bundle.

## Architecture

```text
Jira ticket / logs / files / Stripe event
                     │
                     ▼
            ReproZero orchestrator
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
 OpenAI analysis  Greptile     Claude-Mem
 incident facts   code path    prior incidents
       └─────────────┼─────────────┘
                     ▼
                  ReproSpec
        preconditions · action · assertions
                     │
                     ▼
        deterministic AWS simulator
                     │
              failure reproduced
                     │
                     ▼
          candidate patch + regression test
                     │
                     ▼
            identical scenario rerun
                     │
                     ▼
              verified evidence bundle
```

### Integration responsibilities

| Integration | Role in ReproZero |
| --- | --- |
| **OpenAI Codex** | Primary coding agent used to build ReproZero; runtime incident reasoning and candidate-repair explanation |
| **Greptile** | Repository indexing and execution-path context |
| **Claude-Mem** | Similar-incident recall and storage of verified lessons in the local workflow |
| **AWS** | Domain model for the infrastructure reproduction and executable demo fixture |
| **Stripe** | Signature-verified ingestion for event-driven incident evidence |
| **GitHub** | Source repository access and executable demo inspection |
| **Vercel** | Public deployment of the web application and API routes |

## What is real in the hackathon build?

- OpenAI analysis runs live when `OPENAI_API_KEY` is configured.
- Greptile repository status and indexed commit are retrieved live when configured.
- Stripe webhooks are cryptographically verified and have been tested end to end.
- Claude-Mem recall and observation storage run against the local CMEM worker.
- The AWS demo repository contains executable workflow code and regression tests.
- The web sandbox is a deterministic visualization of the simulated AWS execution.

The demo does **not** provision or mutate real EC2, VPC, subnet, or load-balancer resources. This keeps the hackathon demonstration safe, fast, and repeatable. A production version would execute ReproSpecs in short-lived, policy-controlled cloud sandboxes.

## Local development

### Requirements

- Node.js 22.13 or newer
- npm
- Optional: Claude-Mem worker at `http://127.0.0.1:37777`

### Install and run

```bash
git clone https://github.com/Avantiikaa16/ReproZero.git
cd ReproZero/apps/web
npm ci
cp .env.example .env.local
npm run dev
```

Open the local URL printed in the terminal, normally `http://localhost:3000`.

On Windows PowerShell, copy the environment template with:

```powershell
Copy-Item .env.example .env.local
```

## Environment variables

Minimum variables for the complete hosted workflow:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
GREPTILE_API_KEY=
GITHUB_TOKEN=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

Local Claude-Mem integration:

```dotenv
CLAUDE_MEM_BASE_URL=http://127.0.0.1:37777
```

Never commit `.env.local` or paste credentials into issues, screenshots, or chat messages. Environment files containing secrets are ignored by Git.

## Stripe webhook

The deployed webhook endpoint is:

```text
https://reprozero.vercel.app/api/stripe/webhook
```

The route verifies the `stripe-signature` HMAC, enforces timestamp tolerance, rejects malformed payloads, and detects duplicate event IDs during the active runtime.

For a sandbox test:

```bash
stripe trigger checkout.session.completed
```

## Claude-Mem

Check the local worker:

```powershell
Invoke-RestMethod http://127.0.0.1:37777/api/health
```

A healthy worker reports `status: ok`, `initialized: true`, and `mcpReady: true`.

When ReproZero runs locally, the **Memory** artifact shows recalled memories and the stored observation ID. The hosted Vercel application cannot access a worker bound to the developer's localhost, so it preserves the verified lesson in the exported evidence bundle instead.

## Verification

### Web application

```bash
cd apps/web
npm run lint
npx next build
```

### Executable AWS demo

The simulator and regression tests live in [ReproZero_AWS_Demo](https://github.com/Avantiikaa16/ReproZero_AWS_Demo).

```bash
git clone https://github.com/Avantiikaa16/ReproZero_AWS_Demo.git
cd ReproZero_AWS_Demo
npm test
```

Expected result: two passing tests, including deletion when the VPC is already absent.

## Repository structure

```text
ReproZero/
├── apps/
│   └── web/                 # Next.js application and API routes
├── docs/                    # Architecture and MVP notes
├── integrations/            # Integration design notes
├── packages/
│   └── contracts/           # Shared ReproSpec contract direction
└── services/
    └── orchestrator/        # Orchestration service direction
```

Important web paths:

```text
apps/web/app/page.tsx                    # Incident workspace and sandbox UI
apps/web/app/api/reproduce/route.ts      # Reproduction orchestration endpoint
apps/web/app/api/stripe/webhook/route.ts # Signed Stripe event ingestion
apps/web/app/api/health/route.ts         # Integration configuration health
apps/web/app/lib/live-integrations.ts    # OpenAI, Greptile, and Claude-Mem adapters
apps/web/app/lib/repro-engine.ts         # Deterministic demo result contract
```

## Roadmap

- Execute ReproSpecs in ephemeral cloud microVMs
- Generate an editable failing test directly inside the developer's repository
- Open the reproduction in VS Code, Cursor, or a Codespace
- Apply or reject candidate patches
- Create a branch and pull request with verification evidence
- Ingest Jira, Linear, CI, observability, and support-ticket evidence
- Add secret redaction and policy approval before external execution
- Measure time-to-reproduction, tokens saved, and incident-resolution improvement

## Product vision

```text
Reproduce → Open in IDE → Apply patch → Verify → Create PR
```

ReproZero does not replace the developer's IDE. It removes the slowest and least reliable part of incident response: reconstructing the failure before useful engineering work can begin.

**Every escalated incident should become a portable failing test.**
