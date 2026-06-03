import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Transaction pooler at port 6543 per Section 10 / Section 18 requirement.
// Direct port 5432 exhausts connections under serverless concurrency.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const client = postgres(connectionString, {
  prepare: false, // required for pgbouncer transaction mode
  max: 1, // connection_limit=1 per serverless function instance
});

export const db = drizzle(client, { schema });
