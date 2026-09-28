import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import type { Database } from "./postgres-repositories.js";

export function createDatabase(connectionString: string): { db: Database; close: () => Promise<void> } {
  const client = postgres(connectionString);
  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}
