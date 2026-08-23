# Hackathon MVP scope

## Required working path

```text
Upload synthetic ticket and logs
→ extract incident facts
→ retrieve relevant code context
→ generate a ReproSpec
→ execute a deterministic sandbox
→ confirm the reported failure
→ generate a candidate repair
→ rerun the same reproduction
→ prove the repair
→ store reusable incident memory
```

## Primary demonstration

An AWS-shaped firewall deletion workflow becomes stuck in `DELETING` because its referenced VPC is already absent. The buggy cleanup treats `ResourceNotFound` as failure instead of idempotent success.

## Explicitly out of scope for the first build

- Production Jira authentication
- Real customer data
- Cloning a complete AWS environment
- Provisioning real VPC, EC2, and load-balancer infrastructure during judging
- Arbitrary programming-language support
- Multiple simultaneous repositories
- Full Stripe Billing simulation
- User accounts and billing

## Stretch demonstrations

- Related missing-load-balancer incident for Claude-Mem warm start
- Duplicate Stripe webhook reproduction
- AWS S3 artifact persistence
