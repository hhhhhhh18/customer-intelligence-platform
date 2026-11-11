import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error-handler';
import { validate } from '../../middleware/validate';
import { buildPageMeta, paginationSchema } from '../../utils/pagination';
import { notFound } from '../../utils/errors';
import { enrichExplanation } from '../../utils/llm';
import { recommendationService } from './recommendation.service';

const listSchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  segmentSlug: z.string().max(48).optional(),
  actionSlug: z.string().max(48).optional(),
  eligibility: z.enum(['ELIGIBLE', 'SUPPRESSED', 'NO_ACTION']).optional(),
  suppression: z
    .enum([
      'NOT_SUPPRESSED',
      'SUPPRESSED_CONSENT',
      'SUPPRESSED_CONTACT_PREFERENCE',
      'SUPPRESSED_OPEN_SUPPORT_CASE',
      'SUPPRESSED_RECENT_CONTACT',
      'SUPPRESSED_ACTIVE_COMPLAINT',
    ])
    .optional(),
  status: z.enum(['PENDING', 'ACCEPTED', 'COMPLETED', 'DISMISSED', 'EXPIRED', 'SUPPRESSED']).optional(),
});

export const recommendationsRouter = Router();

recommendationsRouter.get(
  '/',
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listSchema>;
    const { rows, total } = await recommendationService.list(
      {
        search: q.search,
        segmentSlug: q.segmentSlug,
        actionSlug: q.actionSlug,
        eligibility: q.eligibility,
        suppression: q.suppression,
        status: q.status,
      },
      (q.page - 1) * q.pageSize,
      q.pageSize,
    );
    res.json({ data: rows, meta: buildPageMeta(q.page, q.pageSize, total) });
  }),
);

recommendationsRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    res.json({ data: await recommendationService.summary() });
  }),
);

recommendationsRouter.post(
  '/run',
  validate(z.object({ actor: z.string().max(60).optional() }), 'body'),
  asyncHandler(async (req, res) => {
    const summary = await recommendationService.run({ actor: req.body?.actor ?? 'api' });
    res.status(201).json({ data: summary });
  }),
);

recommendationsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const recommendation = Number.isFinite(id)
      ? await recommendationService.detail(id)
      : null;
    if (!recommendation) throw notFound(`Recommendation ${req.params.id} not found`);
    res.json({ data: recommendation });
  }),
);

/** Optional narrative rewrite. The decision itself never changes. */
recommendationsRouter.post(
  '/:id/explain',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const recommendation = Number.isFinite(id) ? await recommendationService.detail(id) : null;
    if (!recommendation) throw notFound(`Recommendation ${req.params.id} not found`);
    const enriched = await enrichExplanation({
      explanation: recommendation.explanation,
      facts: {
        customer: recommendation.customer.customerCode,
        action: recommendation.action.name,
        eligibility: recommendation.eligibility,
        suppression: recommendation.suppressionResult,
        metrics: recommendation.inputMetrics,
      },
    });
    res.json({ data: { explanation: enriched.text, source: enriched.source } });
  }),
);

export const actionsRouter = Router();
actionsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ data: await recommendationService.actions() });
  }),
);
