// ============================================
// TransferVault Daemon — Fastify Server Factory
// ============================================

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { AppConfig } from './config.js';

export async function createServer(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    // Disable body limit for file uploads (TUS handles its own)
    bodyLimit: 1024 * 1024 * 100, // 100MB for metadata requests
    trustProxy: true,
  });

  // TUS Content-Type support
  app.addContentTypeParser(
    'application/offset+octet-stream',
    (_req, _payload, done) => {
      // Do not parse the body, leave the stream intact for TUS server to consume from req.raw
      done(null);
    }
  );

  // CORS
  await app.register(cors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Daemon-Secret',
      'x-daemon-secret',
      'x-owner-id',
      'bypass-tunnel-reminder',
      'Tus-Resumable',
      'Upload-Length',
      'Upload-Offset',
      'Upload-Metadata',
      'Upload-Concat',
      'Upload-Defer-Length',
    ],
    exposedHeaders: [
      'Upload-Offset',
      'Upload-Length',
      'Tus-Resumable',
      'Tus-Version',
      'Tus-Extension',
      'Tus-Max-Size',
      'Location',
      'Content-Range',
      'Content-Length',
      'Accept-Ranges',
    ],
    credentials: true,
  });

  // Global rate limiting (exclude TUS upload paths — each file chunk is a separate request)
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    allowList: (req) => {
      // TUS uploads generate hundreds of requests for large files (one per chunk)
      return req.url?.startsWith('/api/tus') ?? false;
    },
  });

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  }));

  // Root route
  app.get('/', async () => ({
    status: 'TransferVault Daemon Running',
    version: '1.0.0',
  }));

  return app;
}
