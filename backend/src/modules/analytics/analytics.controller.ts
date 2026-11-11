import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error-handler';
import { validate } from '../../middleware/validate';
import { paginationSchema } from '../../utils/pagination';
import { analyticsService } from './analytics.service';
import { validationService } from '../data-quality/validation.service';
import { prisma } from '../../db/prisma';
import { recommendationService } from '../recommendations/recommendation.service';
import { segmentationService } from '../segmentation/segmentation.service';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    res.json({ data: await analyticsService.dashboard() });
  }),
);

dashboardRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const [customers, orders, events] = await Promise.all([
      prisma.customer.count(),
      prisma.order.count(),
      prisma.engagementEvent.count(),
    ]);
    res.json({
      data: {
        status: 'ok',
        database: 'connected',
        counts: { customers, orders, events },
        checks: {
          segmentation: await prisma.segmentationRun.count(),
          recommendations: await prisma.recommendationRun.count(),
          validation: await prisma.dataQualityRun.count(),
        },
      },
    });
  }),
);

const auditSchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

export const auditRouter = Router();
auditRouter.get(
  '/',
  validate(auditSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { limit } = req.query as unknown as z.infer<typeof auditSchema>;
    res.json({ data: await analyticsService.auditTrail(limit) });
  }),
);

export const pipelineRouter = Router();
pipelineRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const [segmentation, recommendations, validation] = await Promise.all([
      segmentationService.runs(5),
      recommendationService.runs(5),
      validationService.history(5),
    ]);
    res.json({ data: { segmentation, recommendations, validation } });
  }),
);
