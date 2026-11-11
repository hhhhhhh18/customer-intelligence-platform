/**
 * Single Prisma client instance and a single import surface for all generated
 * types/enums.  Application code imports from here, never from the generated
 * folder directly, so the schema location stays an implementation detail.
 */
import { PrismaClient } from '../../generated/prisma';

export * from '../../generated/prisma';

declare global {
  // eslint-disable-next-line no-var
  var __cipPrisma: PrismaClient | undefined;
}

export const prisma =
  global.__cipPrisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === '1' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__cipPrisma = prisma;
}

export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

