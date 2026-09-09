import type { ReproductionAdapter } from './types';

const trace = [
  { action: 'GET /api/orders?cursor=eyJpZCI6MTAwfQ', result: 'success' },
  { action: 'GET /api/orders?cursor=eyJpZCI6MTEwfQ', result: 'success' },
  { action: 'client requests next page using stale cursor after a delete', result: 'DuplicateAndMissingRows' },
];

export const apiResponseFailureAdapter: ReproductionAdapter = {
  id: 'api-response-failure',
  name: 'API pagination cursor / response failure',
  canHandle(input) {
    const evidence = input.evidence.toLowerCase();
    return (evidence.includes('pagination') || evidence.includes('cursor')) && (evidence.includes('duplicate') || evidence.includes('missing') || evidence.includes('api'));
  },
  run() {
    return {
      runId: `run_${crypto.randomUUID().slice(0, 8)}`,
      incidentId: 'API-3311',
      verdict: 'FIX_VERIFIED',
      generatedAt: new Date().toISOString(),
      reproSpec: {
        provider: 'api',
        region: 'global',
        resourceId: 'orders-pagination-cursor',
        fixture: 'fixtures/api-pagination-deleted-row.json',
        precondition: 'An order is deleted between two paginated requests using an offset-encoded cursor',
        action: 'GET /api/orders?cursor=<stale>',
        assertions: ['response.rows contains no duplicates', 'response.rows contains no gaps versus the source list'],
      },
      failure: {
        errorCode: 'DuplicateAndMissingRows',
        message: 'Offset-based cursor shifted after a row was deleted mid-pagination, returning one duplicate and skipping one row',
        firewallState: 'INCONSISTENT_PAGE',
        trace,
      },
      codePath: [
        'src/api/orders-controller.js: listOrders',
        'src/api/pagination.js: encodeOffsetCursor',
        'src/db/orders-repository.js: findPage',
        'fixtures/api-pagination-deleted-row.json',
      ],
      patch: {
        file: 'src/api/pagination.candidate.js',
        summary: 'Switch from an offset-encoded cursor to a keyset (last-seen-id) cursor, which stays correct even when rows are deleted mid-pagination.',
        diff: `- function encodeCursor(offset) {\n-   return base64({ offset });\n- }\n- function findPage(offset, limit) { return db.orders.find().skip(offset).limit(limit); }\n\n+ function encodeCursor(lastId) {\n+   return base64({ afterId: lastId });\n+ }\n+ function findPage(afterId, limit) { return db.orders.find({ id: { $gt: afterId } }).limit(limit); }`,
      },
      verification: {
        before: { state: 'INCONSISTENT_PAGE', testsPassing: 1 },
        after: { state: 'CONSISTENT_PAGE', testsPassing: 2 },
        totalTests: 2,
      },
      memory: {
        key: 'incident/api-pagination-cursor',
        lesson: 'Offset-based pagination cursors break under concurrent deletes; use keyset pagination for anything mutated during iteration.',
        confidence: 0.91,
        status: 'stored',
      },
      integrations: { codex: 'primary_build_agent', greptile: 'demo_adapter', claudeMem: 'demo_adapter', api: 'demo_adapter' },
    };
  },
};
