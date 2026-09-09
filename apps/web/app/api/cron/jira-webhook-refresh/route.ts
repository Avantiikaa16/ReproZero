import { eq } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { integrationConnections } from '../../../../db/schema';
import { refreshJiraWebhooks } from '../../../lib/jira-adapter';

export const maxDuration = 60;

/**
 * Vercel Cron hits this once a day (see vercel.json). Atlassian's
 * dynamically registered webhooks expire after ~30 days with no
 * user-visible warning when they lapse — real-time sync would just
 * silently stop and every workspace would fall back to pull-based Resync
 * without anyone noticing. This refreshes every connected Jira workspace's
 * webhook well ahead of that (20 days), for as long as the connection
 * stays connected.
 *
 * Authenticated by CRON_SECRET, which Vercel sends as a bearer token on
 * every Vercel Cron invocation once that env var is set — there's no user
 * session to check here. If CRON_SECRET isn't configured, the check is
 * skipped; the route only ever refreshes an expiration timer, so an
 * unauthenticated call is low-risk, but setting CRON_SECRET is still the
 * recommended production configuration (see .env.example).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const connections = await db.select().from(integrationConnections).where(eq(integrationConnections.provider, 'jira'));

  const results: Array<{ connectionId: string; refreshed: boolean }> = [];

  for (const connection of connections) {
    if (connection.status !== 'connected') continue;

    const config = connection.config as { webhookIds?: number[]; webhookRegisteredAt?: string };
    if (!config.webhookIds?.length) continue;

    const registeredAt = config.webhookRegisteredAt ? new Date(config.webhookRegisteredAt).getTime() : 0;
    const daysSinceRegistered = (Date.now() - registeredAt) / (1000 * 60 * 60 * 24);
    if (daysSinceRegistered < 20) continue;

    try {
      await refreshJiraWebhooks(connection.id, config.webhookIds);
      await db
        .update(integrationConnections)
        .set({ config: { ...config, webhookRegisteredAt: new Date().toISOString() }, updatedAt: new Date() })
        .where(eq(integrationConnections.id, connection.id));
      results.push({ connectionId: connection.id, refreshed: true });
    } catch (error) {
      console.error(`Failed to refresh Jira webhook for connection ${connection.id}.`, error);
      results.push({ connectionId: connection.id, refreshed: false });
    }
  }

  return Response.json({ checked: connections.length, results });
}
