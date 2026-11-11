import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error-handler';
import { validate } from '../../middleware/validate';
import { buildPageMeta, paginationSchema } from '../../utils/pagination';
import { outcomeService } from './outcome.service';

const listSchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'SUCCESS', 'FAILURE', 'NO_RESPONSE', 'UNATTRIBUTED']).optional(),
  actionSlug: z.string().max(48).optional(),
  segmentSlug: z.string().max(48).optional(),
});

const recordSchema = z.object({
  recommendationCode: z.string().regex(/^REC-\d{4}-\d{6}$/, 'recommendationCode must look like REC-2026-000001'),
  actionSlug: z.string().min(1).max(48),
  status: z.enum(['SUCCESS', 'FAILURE', 'NO_RESPONSE', 'PENDING']),
  revenueAttributed: z.number().min(0).max(10_000_000).optional(),
  channel: z.enum(['EMAIL', 'SMS', 'PUSH', 'PHONE', 'DIRECT_MAIL', 'WEB', 'APP']),
  notes: z.string().max(500).optional(),
  respondedAt: z.string().datetime().optional(),
});

export const outcomesRouter = Router();

outcomesRouter.get(
  '/',
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listSchema>;
    const { rows, total } = await outcomeService.list(
      { status: q.status, actionSlug: q.actionSlug, segmentSlug: q.segmentSlug },
      (q.page - 1) * q.pageSize,
      q.pageSize,
    );
    res.json({ data: rows, meta: buildPageMeta(q.page, q.pageSize, total) });
  }),
);

outcomesRouter.get(
  '/metrics',
  asyncHandler(async (_req, res) => {
    res.json({ data: await outcomeService.metrics() });
  }),
);

outcomesRouter.post(
  '/',
  validate(recordSchema, 'body'),
  asyncHandler(async (req, res) => {
    const result = await outcomeService.record(req.body);
    res.status(201).json({
      data: result.outcome,
      warnings: result.mismatch
        ? [
            'Recorded action does not match the recommendation action. The outcome is stored as evidence, flagged invalid, and an exception was raised.',
          ]
        : [],
    });
  }),
);

outcomesRouter.post(
  '/simulate',
  validate(z.object({ seed: z.number().int().optional(), actor: z.string().max(60).optional() }), 'body'),
  asyncHandler(async (req, res) => {
    const result = await outcomeService.simulate({ seed: req.body?.seed, actor: req.body?.actor ?? 'api' });
    res.status(201).json({ data: result });
  }),
);
