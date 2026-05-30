// ============================================
// TransferVault Daemon — Entry Point
// Bootstraps all services and starts the server.
// ============================================

import 'dotenv/config';
import { loadConfig } from './config.js';
import { createServer } from './server.js';
import { StorageService } from './services/storage.js';
import { SupabaseSyncService } from './services/supabase-sync.js';
import { TransferService } from './services/transfer.js';
import { CleanupService } from './services/cleanup.js';
import { registerTransferRoutes } from './routes/transfer.js';
import { registerUploadRoutes } from './routes/upload.js';
import { registerDownloadRoutes } from './routes/download.js';
import { registerAdminRoutes } from './routes/admin.js';

const startTime = Date.now();

async function main() {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║         TransferVault Daemon v1.0        ║
  ║   Private. Fast. Simple.                 ║
  ╚══════════════════════════════════════════╝
  `);

  // 1. Load and validate config
  const config = loadConfig();
  console.log(`✓ Config loaded (${config.NODE_ENV} mode)`);

  // 2. Create Fastify server
  const app = await createServer(config);
  console.log('✓ Server created');

  // 3. Initialize storage
  const storage = new StorageService(config);
  await storage.initialize();
  console.log(`✓ Storage initialized: ${config.DATA_DIR}`);

  // 4. Initialize Supabase sync
  const supabase = new SupabaseSyncService(config);
  console.log('✓ Supabase sync initialized');

  // 5. Initialize transfer service
  const transferService = new TransferService(config, supabase, storage);
  console.log('✓ Transfer service initialized');

  // 6. Register routes
  await registerTransferRoutes(app, { config, transferService, supabase });
  await registerUploadRoutes(app, { config, storage, supabase });
  await registerDownloadRoutes(app, { config, transferService, supabase });

  // Admin routes (separate scope with auth)
  await app.register(async (adminApp) => {
    await registerAdminRoutes(adminApp, {
      config,
      transferService,
      storage,
      supabase,
      startTime,
    });
  });

  console.log('✓ Routes registered');

  // 7. Start cleanup service
  const cleanup = new CleanupService(config, supabase, storage, app.log);
  cleanup.start();
  console.log('✓ Cleanup service started');

  // 8. Start heartbeat
  supabase.startHeartbeat(async () => {
    const diskStats = await storage.getDiskStats();
    return {
      disk_total_bytes: diskStats.total,
      disk_free_bytes: diskStats.free,
      version: '1.0.0',
    };
  });
  console.log('✓ Heartbeat started');

  // 9. Start the server
  try {
    const address = await app.listen({ port: config.PORT, host: config.HOST });
    console.log(`\n🚀 TransferVault daemon listening on ${address}`);
    console.log(`   Health: ${address}/health`);
    console.log(`   TUS:    ${address}/api/tus`);
    console.log(`   API:    ${address}/api/transfers`);
  } catch (err) {
    app.log.error(err, 'Failed to start server');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down...`);

    cleanup.stop();
    await supabase.stopHeartbeat();
    await app.close();

    console.log('Daemon stopped cleanly.');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
