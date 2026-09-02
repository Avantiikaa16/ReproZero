import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL_UNPOOLED (or DATABASE_URL) is not set. Migrations need a direct connection string.');
}

async function main() {
  const sql = neon(connectionString!);
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: './db/migrations' });
  console.log('Migrations applied.');
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
