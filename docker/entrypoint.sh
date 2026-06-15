#!/bin/sh
set -e
cd /app

echo "Waiting for database..."
npx tsx server/src/db/waitForDb.ts

echo "Applying migrations..."
npx tsx server/src/db/migrate.ts

if [ "$SEED_ON_START" = "true" ]; then
  echo "Seeding database..."
  npx tsx server/src/db/seed.ts
fi

echo "Starting Dealer Locator API + web..."
exec npx tsx server/src/index.ts
