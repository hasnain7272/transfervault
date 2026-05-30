// ============================================
// TransferVault Daemon — TUS Upload Routes
// Resumable file uploads using TUS protocol.
// ============================================

import type { FastifyInstance } from 'fastify';
import { Server as TusServer } from '@tus/server';
import { FileStore } from '@tus/file-store';
import path from 'node:path';
import fs from 'node:fs';
import type { StorageService } from '../services/storage.js';
import type { SupabaseSyncService } from '../services/supabase-sync.js';
import type { AppConfig } from '../config.js';

interface UploadRouteDeps {
  config: AppConfig;
  storage: StorageService;
  supabase: SupabaseSyncService;
}

export async function registerUploadRoutes(
  app: FastifyInstance,
  deps: UploadRouteDeps,
): Promise<void> {
  const { config, storage } = deps;
  const uploadsDir = path.join(config.DATA_DIR, '.tus-uploads');

  // Ensure TUS upload directory exists
  await fs.promises.mkdir(uploadsDir, { recursive: true });

  const tusServer = new TusServer({
    path: '/api/tus',
    datastore: new FileStore({ directory: uploadsDir }),
    maxSize: config.MAX_FILE_SIZE_GB * 1024 * 1024 * 1024,
    generateUrl: (req, { proto, host, path: tusPath, id }) => {
      const forwardedProto = req.headers['x-forwarded-proto'];
      const resolvedProto = typeof forwardedProto === 'string' ? forwardedProto : proto;
      return `${resolvedProto}://${host}${tusPath}/${id}`;
    },
    namingFunction: (_req, metadata) => {
      // Safe flat naming to prevent slashes in relative folder paths from breaking TUS storage
      const pairCode = metadata?.['pair_code'] ?? 'unknown';
      const fileId = metadata?.['file_id'] ?? 'unknown';
      return `${pairCode}_${fileId}`;
    },
    onUploadCreate: async (_req, _res, upload) => {
      app.log.info(`TUS upload created: ${upload.id} (${upload.size} bytes)`);
      return _res;
    },
    onUploadFinish: async (_req, _res, upload) => {
      app.log.info(`TUS upload finished: ${upload.id}`);

      // Move completed file to transfer directory
      const metadata = upload.metadata ?? {};
      const pairCode = metadata['pair_code'];
      const filename = metadata['filename'];

      if (pairCode && filename) {
        const sourcePath = path.join(uploadsDir, upload.id);
        const targetDir = storage.getTransferPath(pairCode);
        const targetPath = path.join(targetDir, filename);

        try {
          // Recursively create target folder structure (especially for nested folder uploads)
          await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
          await fs.promises.rename(sourcePath, targetPath);

          // Clean up TUS metadata files
          const infoPath = `${sourcePath}.json`;
          try {
            await fs.promises.unlink(infoPath);
          } catch {
            // Info file might not exist
          }

          app.log.info(`Moved upload to: ${targetPath}`);
        } catch (err) {
          app.log.error(err, `Failed to move upload for ${pairCode}/${filename}`);

          // If rename fails (cross-device), try copy + delete
          try {
            await fs.promises.copyFile(sourcePath, targetPath);
            await fs.promises.unlink(sourcePath);
            app.log.info(`Copied upload to: ${targetPath} (cross-device)`);
          } catch (copyErr) {
            app.log.error(copyErr, 'Copy fallback also failed');
          }
        }
      }

      return _res;
    },
  });

  // Route all TUS requests through Fastify
  app.all('/api/tus', async (req, reply) => {
    await tusServer.handle(req.raw, reply.raw);
    reply.hijack();
  });

  app.all('/api/tus/*', async (req, reply) => {
    await tusServer.handle(req.raw, reply.raw);
    reply.hijack();
  });
}
