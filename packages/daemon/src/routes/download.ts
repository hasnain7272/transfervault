// ============================================
// TransferVault Daemon — Download Routes
// Streaming file downloads with range requests.
// ============================================

import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import type { TransferService } from '../services/transfer.js';
import type { SupabaseSyncService } from '../services/supabase-sync.js';
import type { AppConfig } from '../config.js';

interface DownloadRouteDeps {
  config: AppConfig;
  transferService: TransferService;
  supabase: SupabaseSyncService;
}

export async function registerDownloadRoutes(
  app: FastifyInstance,
  deps: DownloadRouteDeps,
): Promise<void> {
  const { config, transferService, supabase } = deps;

  // ──────────────────────────────────────────
  // GET /api/download/:transferId/:fileId — Download a file
  // Supports HTTP Range requests for resumable downloads.
  // ──────────────────────────────────────────
  app.get<{
    Params: { transferId: string; fileId: string };
    Querystring: { password?: string };
  }>(
    '/api/download/:transferId/:fileId',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { transferId, fileId } = request.params;

      try {
        // Verify password if needed
        if (request.query.password) {
          const valid = await transferService.verifyPassword(transferId, request.query.password);
          if (!valid) {
            await supabase.logAudit({
              transfer_id: transferId,
              event_type: 'password_attempt_failed',
              ip_address: request.ip,
              user_agent: request.headers['user-agent'] ?? null,
            });
            return reply.status(401).send({ error: 'Invalid password' });
          }
        }

        // Get file path
        const fileInfo = await transferService.getDownloadPath(transferId, fileId);
        if (!fileInfo) {
          return reply.status(404).send({ error: 'File not found' });
        }

        const { path: filePath, filename, size, mime } = fileInfo;

        // Check file exists on disk
        try {
          await fs.promises.access(filePath, fs.constants.R_OK);
        } catch {
          return reply.status(404).send({ error: 'File not available on disk' });
        }

        const stat = await fs.promises.stat(filePath);
        const fileSize = stat.size;

        // Log download start
        await supabase.logAudit({
          transfer_id: transferId,
          event_type: 'download_started',
          ip_address: request.ip,
          user_agent: request.headers['user-agent'] ?? null,
          metadata: { file_id: fileId, filename },
        });

        // Handle Range requests
        const rangeHeader = request.headers.range;

        if (rangeHeader) {
          const parts = rangeHeader.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0]!, 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

          if (start >= fileSize || end >= fileSize) {
            return reply
              .status(416)
              .header('Content-Range', `bytes */${fileSize}`)
              .send({ error: 'Range not satisfiable' });
          }

          const chunkSize = end - start + 1;
          const stream = fs.createReadStream(filePath, { start, end });

          reply
            .status(206)
            .header('Content-Range', `bytes ${start}-${end}/${fileSize}`)
            .header('Accept-Ranges', 'bytes')
            .header('Content-Length', chunkSize)
            .header('Content-Type', mime ?? 'application/octet-stream')
            .header(
              'Content-Disposition',
              `attachment; filename="${encodeURIComponent(filename)}"`,
            );

          // Increment download count on first chunk
          if (start === 0) {
            await supabase.incrementDownloadCount(transferId);
          }

          return reply.send(stream);
        }

        // Full file download
        const stream = fs.createReadStream(filePath);

        await supabase.incrementDownloadCount(transferId);

        reply
          .header('Content-Length', fileSize)
          .header('Content-Type', mime ?? 'application/octet-stream')
          .header('Accept-Ranges', 'bytes')
          .header(
            'Content-Disposition',
            `attachment; filename="${encodeURIComponent(filename)}"`,
          );

        // Log completion (best effort — we can't know when streaming finishes)
        stream.on('end', () => {
          void supabase.logAudit({
            transfer_id: transferId,
            event_type: 'download_completed',
            ip_address: request.ip,
            user_agent: request.headers['user-agent'] ?? null,
            metadata: { file_id: fileId, filename },
          });
        });

        return reply.send(stream);
      } catch (err) {
        request.log.error(err, 'Download failed');

        await supabase.logAudit({
          transfer_id: transferId,
          event_type: 'download_failed',
          ip_address: request.ip,
          user_agent: request.headers['user-agent'] ?? null,
          metadata: { file_id: fileId, error: String(err) },
        });

        return reply.status(500).send({ error: 'Download failed' });
      }
    },
  );
}
