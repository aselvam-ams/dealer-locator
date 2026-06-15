import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function list(name: string, fallback = ''): string[] {
  return required(name, fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  databaseUrl: required(
    'DATABASE_URL',
    'postgres://dealer:dealer@localhost:5433/dealer_locator',
  ),
  port: Number(required('PORT', '4000')),
  jwtSecret: required('JWT_SECRET', 'dev-only-change-me'),
  allowedOrigins: list('ALLOWED_ORIGINS', 'http://localhost:5173'),
  frameAncestors: list('FRAME_ANCESTORS', ''),
  sftpOutDir: required('SFTP_OUT_DIR', './sftp-out'),
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',
  // When set, the API also serves the built React app (single-image deploy).
  serveWeb: (process.env.SERVE_WEB ?? 'false') === 'true',
  webDist: process.env.WEB_DIST ?? '',
};

export type Config = typeof config;
