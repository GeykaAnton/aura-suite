// Aplica db/schema.sql a la base de datos de DATABASE_URL (idempotente: se puede correr varias veces).
//   npm run db:migrate
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Define DATABASE_URL en .env');
  process.exit(1);
}
const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, '\n');

const sql = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
const client = new pg.Client({ connectionString: url, ...(ca ? { ssl: { ca } } : {}) });
await client.connect();
try {
  await client.query(sql);
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM categories WHERE user_id IS NULL`);
  console.log(`✅ Esquema aplicado (${rows[0].n} categorías del sistema)`);
} finally {
  await client.end();
}
