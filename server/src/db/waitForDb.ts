import { pool } from './pool.js';

// Block until the database accepts connections (used by the container
// entrypoint before running migrations).
const MAX_ATTEMPTS = 30;
const DELAY_MS = 2000;

async function main() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await pool.query('SELECT 1');
      console.log('Database is ready.');
      await pool.end();
      return;
    } catch (err) {
      console.log(`Waiting for database (attempt ${attempt}/${MAX_ATTEMPTS})...`);
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }
  console.error('Database did not become ready in time.');
  process.exit(1);
}

main();
