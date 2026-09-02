import 'server-only';
import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

type Db = NeonHttpDatabase<typeof schema>;

let cached: Db | null = null;

/**
 * Lazily instantiated so importing this module (e.g. during `next build`'s
 * page-data collection, before .env.local has real Neon credentials) never
 * throws. The error only surfaces when a route actually queries the DB.
 */
function getDb(): Db {
  if (cached) return cached;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Add it to .env.local (see .env.example).');
  }
  cached = drizzle(neon(connectionString), { schema });
  return cached;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
