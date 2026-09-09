import type { ReproductionAdapter } from './types';

const trace = [
  { action: 'migrate(0041_add_not_null_org_id)', result: 'ConstraintViolation' },
  { action: 'scan(incidents where organization_id IS NULL)', result: '212 rows found' },
  { action: 'ROLLBACK', result: 'success' },
];

export const databaseMigrationAdapter: ReproductionAdapter = {
  id: 'database-migration',
  name: 'Database migration/schema issue',
  canHandle(input) {
    const evidence = input.evidence.toLowerCase();
    return (evidence.includes('migration') || evidence.includes('schema')) && (evidence.includes('constraint') || evidence.includes('null') || evidence.includes('rollback'));
  },
  run() {
    return {
      runId: `run_${crypto.randomUUID().slice(0, 8)}`,
      incidentId: 'DB-2290',
      verdict: 'FIX_VERIFIED',
      generatedAt: new Date().toISOString(),
      reproSpec: {
        provider: 'database',
        region: 'primary',
        resourceId: 'incidents.organization_id',
        fixture: 'fixtures/incidents-legacy-null-org.sql',
        precondition: '212 legacy rows exist with organization_id = NULL, created before the column was required',
        action: 'ALTER TABLE incidents ALTER COLUMN organization_id SET NOT NULL',
        assertions: ['migration succeeds without data loss', 'all pre-existing rows keep a valid organization_id'],
      },
      failure: {
        errorCode: 'ConstraintViolation',
        message: 'ALTER COLUMN ... SET NOT NULL failed: column contains 212 null values, migration rolled back automatically',
        firewallState: 'MIGRATION_ROLLED_BACK',
        trace,
      },
      codePath: [
        'db/migrations/0041_add_not_null_org_id.sql',
        'db/schema/incidents.ts',
        'scripts/backfill-legacy-incidents.js',
        'fixtures/incidents-legacy-null-org.sql',
      ],
      patch: {
        file: 'db/migrations/0041_add_not_null_org_id.candidate.sql',
        summary: 'Backfill the 212 legacy rows into a placeholder "unassigned" organization in a preceding migration, then apply the NOT NULL constraint in a second, separate migration.',
        diff: `+ -- 0041a_backfill_legacy_incidents.sql\n+ UPDATE incidents SET organization_id = '00000000-0000-0000-0000-000000000000' WHERE organization_id IS NULL;\n\n  -- 0041b_add_not_null_org_id.sql\n  ALTER TABLE incidents ALTER COLUMN organization_id SET NOT NULL;`,
      },
      verification: {
        before: { state: 'MIGRATION_ROLLED_BACK', testsPassing: 0 },
        after: { state: 'MIGRATION_APPLIED', testsPassing: 1 },
        totalTests: 1,
      },
      memory: {
        key: 'incident/migration-not-null-backfill',
        lesson: 'Adding a NOT NULL constraint to an existing column needs a separate backfill migration first — never combine backfill and constraint in one step.',
        confidence: 0.93,
        status: 'stored',
      },
      integrations: { codex: 'primary_build_agent', greptile: 'demo_adapter', claudeMem: 'demo_adapter' },
    };
  },
};
