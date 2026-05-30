// ============================================
// TransferVault Daemon — Admin Routes
// Stats and monitoring endpoints.
// ============================================

import type { FastifyInstance } from 'fastify';
import type { TransferService } from '../services/transfer.js';
import type { StorageService } from '../services/storage.js';
import type { SupabaseSyncService } from '../services/supabase-sync.js';
import type { AppConfig } from '../config.js';

interface AdminRouteDeps {
  config: AppConfig;
  transferService: TransferService;
  storage: StorageService;
  supabase: SupabaseSyncService;
  startTime: number;
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  deps: AdminRouteDeps,
): Promise<void> {
  const { config, storage, supabase, startTime } = deps;

  // Auth middleware for admin routes
  app.addHook('onRequest', async (request, reply) => {
    const secret = request.headers['x-daemon-secret'];
    if (secret !== config.DAEMON_SECRET) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  });

  // ──────────────────────────────────────────
  // GET /api/admin/stats — System statistics
  // ──────────────────────────────────────────
  app.get('/api/admin/stats', async (_request, reply) => {
    try {
      const [diskStats, transferStats] = await Promise.all([
        storage.getDiskStats(),
        supabase.getTransferStats(),
      ]);

      const stats = {
        daemon_online: true,
        uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
        disk_total_bytes: diskStats.total,
        disk_free_bytes: diskStats.free,
        disk_used_bytes: diskStats.used,
        transfers_size_bytes: diskStats.transfersSize,
        total_transfers: transferStats.total,
        transfers_by_status: transferStats.byStatus,
      };

      return reply.send(stats);
    } catch (err) {
      app.log.error(err, 'Failed to get admin stats');
      return reply.status(500).send({ error: 'Failed to get stats' });
    }
  });

  // ──────────────────────────────────────────
  // GET /api/admin/transfers — List all transfers
  // ──────────────────────────────────────────
  app.get<{ Querystring: { status?: string; limit?: string; offset?: string } }>(
    '/api/admin/transfers',
    async (request, reply) => {
      try {
        const { status, limit = '50', offset = '0' } = request.query;

        let query = supabase
          .getClient()
          .from('transfers')
          .select('*, files(id, filename, size_bytes)')
          .order('created_at', { ascending: false })
          .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

        if (status) {
          query = query.eq('status', status);
        }

        const { data, error } = await query;
        if (error) throw error;

        return reply.send(data);
      } catch (err) {
        app.log.error(err, 'Failed to list transfers');
        return reply.status(500).send({ error: 'Failed to list transfers' });
      }
    },
  );

  // ──────────────────────────────────────────
  // GET /api/admin/audit — Audit log viewer
  // ──────────────────────────────────────────
  app.get<{ Querystring: { limit?: string; offset?: string; event_type?: string } }>(
    '/api/admin/audit',
    async (request, reply) => {
      try {
        const { limit = '100', offset = '0', event_type } = request.query;

        let query = supabase
          .getClient()
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

        if (event_type) {
          query = query.eq('event_type', event_type);
        }

        const { data, error } = await query;
        if (error) throw error;

        return reply.send(data);
      } catch (err) {
        app.log.error(err, 'Failed to get audit logs');
        return reply.status(500).send({ error: 'Failed to get audit logs' });
      }
    },
  );
}
