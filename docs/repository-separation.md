# Repository separation

## Main product repository

This repository contains the ReproZero interface, orchestration, contracts, integrations, and product documentation.

## AWS demo repository

The synthetic firewall control-plane application will live in a separate local repository. ReproZero must treat it as an external customer repository rather than importing private implementation knowledge from it.

Recommended sibling path:

```text
C:\Users\achap\OneDrive\Desktop\Avantika\Projects\ReproZero-AwsDemo
```

The demo repository will later contain:

- Buggy firewall deletion workflow
- Pre-existing passing test
- AWS-compatible deterministic adapter
- Synthetic Jira ticket attachments and logs
- No reference repair inside the repository

The expected repair evaluator should remain outside the demo repository so Codex must independently derive the fix.
