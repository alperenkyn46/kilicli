import { createDatabase } from "./client.js";
import { migrateDatabase } from "./migrate.js";
import { createPostgresRepositories } from "./postgres-repositories.js";
import { seedFoundationCatalog } from "./seed.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

await migrateDatabase(connectionString);
const database = createDatabase(connectionString);
await seedFoundationCatalog(createPostgresRepositories(database.db));
await database.close();
