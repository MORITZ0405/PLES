import { defineConfig } from 'drizzle-kit';

// `drizzle-kit generate` reads this to emit reviewable SQL migrations from the schema.
// No DB connection is made at generate time; the same SQL applies to PGlite and Postgres.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
});
