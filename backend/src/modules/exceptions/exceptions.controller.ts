import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error-handler';
import { validate } from '../../middleware/validate';
import { buildPageMeta, paginationSchema } from '../../utils/pagination';
import { notFound } from '../../utils/errors';
import { ExceptionsRepository } from './exceptions.repository';
import { detectorService } from './detector.service';

const repo = new ExceptionsRepository();

const listSchema = paginationSchema.extend({
  category: z
    .enum([
      'SEGMENT_CONFLICT',
      'CONSENT_VIOLATION',
      'RETURN_NOT_NETTED',
      'OUTCOME_ATTRIBUTION',
      'REFERENTIAL_INTEGRITY',
      'DUPLICATE_RECORD',
      'ARITHMETIC_MISMATCH',
      'ENUM_VIOLATION',
      'ID_FORMAT',
      'CONSENT_LIFECYCLE',
    ])
    .optional(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  status: z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED', 'IGNORED']).optional(),
  search: z.string().trim().max(120).optional(),
});

const resolveSchema = z.object({
  status: z.enum(['INVESTIGATING', 'RESOLVED', 'IGNORED']),
  resolutionNotes: z.string().max(1000).optional(),
  actor: z.string().max(60).optional(),
});

export const exceptionsRouter = Router();

exceptionsRouter.get(
  '/',
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listSchema>;
    const { rows, total } = await repo.findMany(q, (q.page - 1) * q.pageSize, q.pageSize);
    res.json({ data: rows, meta: buildPageMeta(q.page, q.pageSize, total) });
  }),
);

exceptionsRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    res.json({ data: await repo.summary() });
  }),
);

exceptionsRouter.post(
  '/scan',
  asyncHandler(async (_req, res) => {
    const result = await detectorService.runAll();
    res.status(201).json({ data: result });
  }),
);

exceptionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const record = Number.isFinite(id) ? await repo.findById(id) : null;
    if (!record) throw notFound(`Exception ${req.params.id} not found`);
    res.json({ data: record });
  }),
);

exceptionsRouter.patch(
  '/:id',
  validate(resolveSchema, 'body'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const updated = await detectorService.resolve(id, req.body.status, req.body.resolutionNotes, req.body.actor ?? 'api');
    if (!updated) throw notFound(`Exception ${req.params.id} not found`);
    res.json({ data: updated });
  }),
);
