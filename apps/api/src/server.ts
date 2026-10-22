import { createApp } from './app.js';
import { validateEnv } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './infrastructure/database/mongo.js';
import { logger } from './infrastructure/observability/logger.js';
import type { Server } from 'node:http';

async function startServer(): Promise<void> {
  // 1. Validate environment configuration before booting
  let config;
  try {
    config = validateEnv(process.env);
  } catch (error) {
    logger.fatal({ err: error }, 'Configuration validation failed during server startup');
    process.exit(1);
  }

  // 2. Attempt MongoDB connection
  try {
    await connectDatabase(config.MONGODB_URI);
  } catch {
    logger.error(
      'MongoDB initial connection failed. The application will start in degraded readiness mode.',
    );
  }

  // 3. Create Express app
  const app = createApp({
    frontendUrl: config.FRONTEND_URL,
    enableLogging: true,
  });

  // 4. Start HTTP listener
  const server: Server = app.listen(config.PORT, () => {
    logger.info(
      {
        port: config.PORT,
        environment: config.NODE_ENV,
      },
      'MoneyLens API server is listening',
    );
  });

  // 5. Graceful shutdown handler
  let isShuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, 'Graceful shutdown initiated');

    // Stop accepting new HTTP connections
    server.close(async () => {
      logger.info('HTTP server closed');

      // Disconnect from database
      await disconnectDatabase();

      logger.info('Graceful shutdown completed successfully');
      process.exit(0);
    });

    // Force shutdown after timeout if connections don't close
    setTimeout(() => {
      logger.error('Forced shutdown due to timeout');
      process.exit(1);
    }, 10000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception detected');
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled promise rejection detected');
    shutdown('unhandledRejection');
  });
}

// Start application
startServer().catch((err) => {
  logger.fatal({ err }, 'Fatal startup failure');
  process.exit(1);
});
