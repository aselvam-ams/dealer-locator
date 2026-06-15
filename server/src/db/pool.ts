import pg from 'pg';
import { config } from '../config.js';

// node-postgres returns NUMERIC/int8 as strings by default; for our lat/long
// and distances we want JS numbers.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric
pg.types.setTypeParser(701, (v) => (v === null ? null : Number(v))); // float8

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
