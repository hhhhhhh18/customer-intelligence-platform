import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './db/prisma';
import { logger } from './utils/logger';

async function main() {
  const app = createApp();

  await prisma.$connect();
  logger.info('database connected', { database: env.DATABASE_URL.replace(/:[^:@/]+@/, ':***@') });

  const server = app.listen(env.PORT, () => {
    logger.info(`api listening on http://localhost:${env.PORT}`);
  });

  const shutdown = async (signal: string) => {
    logger.info('shutting down', { signal });
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(async (error) => {
  logger.error('failed to start server', { message: error instanceof Error ? error.message : String(error) });
  await prisma.$disconnect();
  process.exit(1);
});
