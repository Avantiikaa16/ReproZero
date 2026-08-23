# ReproZero architecture

## Product boundary

ReproZero converts incomplete incident evidence into the smallest causally faithful environment that reproduces the reported failure. It does not attempt to copy a customer's complete production environment.

## Core pipeline

1. **Evidence intake** accepts tickets, logs, screenshots, structured events, and repository references.
2. **Privacy boundary** redacts secrets and customer identifiers before external processing.
3. **Incident understanding** separates confirmed facts, hypotheses, missing evidence, and desired outcomes.
4. **Memory retrieval** checks Claude-Mem for related incidents, failed attempts, and verified repairs.
5. **Code retrieval** uses Greptile to locate the relevant execution path across the repository.
6. **Reproduction planning** compiles the evidence and code context into a ReproSpec.
7. **Sandbox execution** creates the minimum state required to reproduce the failure.
8. **Validation** compares the observed sandbox failure with the ticket's reported behavior.
9. **Repair** gives Codex the reproduction, code context, and logs required to propose a patch.
10. **Verification** runs the same reproduction before and after the patch.
11. **Learning** stores the sanitized incident, reproduction, failed attempts, and verified fix in Claude-Mem.

## Sponsor responsibilities

- **OpenAI Codex:** primary development agent; incident reasoning, ReproSpec generation, test generation, and repair.
- **Greptile:** repository-wide execution-path and dependency context.
- **Claude-Mem:** related-incident retrieval and reusable organizational memory.
- **Modal or AWS:** isolated reproduction execution.
- **AWS:** first incident-domain adapter and optional artifact storage.
- **Stripe:** secondary payment-incident adapter.

## Trust rules

- Never send raw secrets or customer identifiers to external services.
- Label extracted information as confirmed, inferred, or missing.
- Require approval of a generated ReproSpec before cloud execution.
- Use short-lived, isolated sandboxes with no production access.
- Preserve exact execution evidence for every reproduction and repair verdict.
