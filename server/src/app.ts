import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { authRoutes } from './routes/auth.js';
import { searchRoutes } from './routes/search.js';
import { locationRoutes } from './routes/locations.js';
import { stopTowRoutes } from './routes/stopTow.js';
import { importExportRoutes } from './routes/importExport.js';
import { changeRegisterRoutes } from './routes/changeRegister.js';
import { oemIngestRoutes } from './routes/oemIngest.js';

export async function buildApp() {
  const app = Fastify({
    logger: true,
    bodyLimit: 25 * 1024 * 1024, // allow base64 Excel uploads
  });

  // CORS / frame-ancestors locked to the configured origins (spec 6.3 / 9.5).
  await app.register(cors, {
    origin: config.allowedOrigins,
    credentials: true,
  });

  // Embed contract: only the configured Salesforce org domain(s) may frame us.
  const frameAncestors = config.frameAncestors.length
    ? config.frameAncestors.join(' ')
    : "'none'";
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('Content-Security-Policy', `frame-ancestors ${frameAncestors}`);
    reply.header('X-Frame-Options', config.frameAncestors.length ? 'ALLOW-FROM ' + config.frameAncestors[0] : 'DENY');
    return payload;
  });

  app.get('/health', async () => ({ status: 'ok' }));

  // Embed configuration consumed by the Salesforce iframe (spec 6.3).
  app.get('/embed/config', async () => ({
    allowed_origins: config.allowedOrigins,
    frame_ancestors: config.frameAncestors,
    auth: 'app-managed', // Phase 1; SSO in Phase 2
  }));

  await app.register(authRoutes);
  await app.register(searchRoutes);
  await app.register(locationRoutes);
  await app.register(stopTowRoutes);
  await app.register(importExportRoutes);
  await app.register(changeRegisterRoutes);
  await app.register(oemIngestRoutes);

  // Single-image deploy: serve the built React app and SPA-fallback to
  // index.html for client-side routes (anything that isn't an API path).
  if (config.serveWeb && config.webDist && existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api') && !req.url.startsWith('/embed/')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not found' });
    });
    app.log.info(`Serving web app from ${config.webDist}`);
  }

  return app;
}
