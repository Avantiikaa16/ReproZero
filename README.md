# ReproZero

ReproZero turns production incident evidence into a minimal executable reproduction, then uses the same reproduction to verify a repair.

## Product flow

```text
Ticket, logs, screenshots, and events
                  ↓
         Incident understanding
                  ↓
      Similar-incident memory search
                  ↓
       Repository context retrieval
                  ↓
        ReproSpec generation
                  ↓
       Isolated failure reproduction
                  ↓
         Repair and verification
                  ↓
       Reusable incident memory
```

## Repository layout

- `apps/web` — landing page and incident workspace
- `services/orchestrator` — evidence-to-reproduction workflow
- `packages/contracts` — shared ReproSpec and incident schemas
- `integrations` — sponsor and external-system adapters
- `docs` — architecture, scope, and demo planning

The AWS firewall demonstration repository will be created later as a separate local repository. It does not belong inside this product repository.

## Current status

Project structure and product contracts are being prepared. Product implementation has not started.
