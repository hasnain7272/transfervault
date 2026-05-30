// ============================================
// TransferVault Daemon — Transfer Routes
// REST API for transfer management.
// ============================================

import type { FastifyInstance } from 'fastify';
import type { TransferService } from '../services/transfer.js';
import type { SupabaseSyncService } from '../services/supabase-sync.js';
import type { AppConfig } from '../config.js';
import type { CreateTransferRequest } from '../types/transfer.js';

interface TransferRouteDeps {
  config: AppConfig;
  transferService: TransferService;
  supabase: SupabaseSyncService;
}

export async function registerTransferRoutes(
  app: FastifyInstance,
  deps: TransferRouteDeps,
): Promise<void> {
  const { config, transferService, supabase } = deps;

  // ──────────────────────────────────────────
  // POST /api/transfers — Create a new transfer
  // ──────────────────────────────────────────
  app.post<{ Body: CreateTransferRequest }>(
    '/api/transfers',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      try {
        const body = request.body;

        if (!body.files || body.files.length === 0) {
          return reply.status(400).send({ error: 'At least one file is required' });
        }

        if (!body.expires_in_hours || body.expires_in_hours < 1) {
          return reply.status(400).send({ error: 'expires_in_hours must be at least 1' });
        }

        const result = await transferService.createTransfer(body);
        return reply.status(201).send(result);
      } catch (err) {
        request.log.error(err, 'Failed to create transfer');
        return reply.status(500).send({ error: 'Failed to create transfer' });
      }
    },
  );

  // ──────────────────────────────────────────
  // GET /api/transfers/lookup/:pairCode — Lookup transfer by pair code
  // ──────────────────────────────────────────
  app.get<{ Params: { pairCode: string } }>(
    '/api/transfers/lookup/:pairCode',
    {
      config: {
        rateLimit: {
          max: config.PAIR_CODE_RATE_LIMIT,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      try {
        const { pairCode } = request.params;
        const transfer = await transferService.lookupTransfer(pairCode);

        if (!transfer) {
          // Log failed lookup
          await supabase.logAudit({
            transfer_id: null,
            event_type: 'pair_code_lookup_failed',
            ip_address: request.ip,
            user_agent: request.headers['user-agent'] ?? null,
            metadata: { pair_code: pairCode },
          });

          return reply.status(404).send({ error: 'Transfer not found or expired' });
        }

        return reply.send(transfer);
      } catch (err) {
        request.log.error(err, 'Lookup failed');
        return reply.status(500).send({ error: 'Lookup failed' });
      }
    },
  );

  // ──────────────────────────────────────────
  // POST /api/transfers/:id/finalize — Mark upload as complete
  // ──────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/api/transfers/:id/finalize',
    async (request, reply) => {
      try {
        await transferService.finalizeTransfer(request.params.id);
        return reply.send({ status: 'ready' });
      } catch (err) {
        request.log.error(err, 'Finalize failed');
        return reply.status(500).send({ error: 'Finalize failed' });
      }
    },
  );

  // ──────────────────────────────────────────
  // POST /api/transfers/:id/verify-password — Verify transfer password
  // ──────────────────────────────────────────
  app.post<{ Params: { id: string }; Body: { password: string } }>(
    '/api/transfers/:id/verify-password',
    {
      config: {
        rateLimit: {
          max: config.PAIR_CODE_RATE_LIMIT,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      try {
        const valid = await transferService.verifyPassword(
          request.params.id,
          request.body.password,
        );

        if (!valid) {
          await supabase.logAudit({
            transfer_id: request.params.id,
            event_type: 'password_attempt_failed',
            ip_address: request.ip,
            user_agent: request.headers['user-agent'] ?? null,
          });

          return reply.status(401).send({ error: 'Invalid password' });
        }

        return reply.send({ valid: true });
      } catch (err) {
        request.log.error(err, 'Password verification failed');
        return reply.status(500).send({ error: 'Verification failed' });
      }
    },
  );

  // ──────────────────────────────────────────
  // DELETE /api/transfers/:id — Delete a transfer
  // ──────────────────────────────────────────
  app.delete<{ Params: { id: string }; Headers: { 'x-owner-id'?: string } }>(
    '/api/transfers/:id',
    async (request, reply) => {
      const ownerId = request.headers['x-owner-id'];
      if (!ownerId) {
        return reply.status(401).send({ error: 'Owner ID required' });
      }

      const deleted = await transferService.deleteTransfer(request.params.id, ownerId);
      if (!deleted) {
        return reply.status(404).send({ error: 'Transfer not found or unauthorized' });
      }

      return reply.send({ deleted: true });
    },
  );
}
