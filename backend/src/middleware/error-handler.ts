import { NextFunction, Request, Response } from 'express';
import { Prisma } from '../../generated/prisma';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `No route matches ${req.method} ${req.originalUrl}`,
    },
  });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    logger.warn('request failed', { path: req.originalUrl, code: err.code, status: err.statusCode });
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details ?? undefined },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: { code: 'UNIQUE_VIOLATION', message: 'A record with this unique value already exists', details: err.meta },
      });
    }
    if (err.code === 'P2003' || err.code === 'P2014') {
      return res.status(409).json({
        error: { code: 'FOREIGN_KEY_VIOLATION', message: 'Related record is missing or still referenced', details: err.meta },
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'The requested record does not exist', details: err.meta },
      });
    }
  }

  logger.error('unhandled error', {
    path: req.originalUrl,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}

/** Wraps async controllers so rejected promises reach the error handler. */
export const asyncHandler =
  <T>(fn: (req: Request, res: Response, next: NextFunction) => Promise<T>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

