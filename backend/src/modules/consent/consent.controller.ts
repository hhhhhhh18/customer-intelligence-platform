import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error-handler';
import { validate } from '../../middleware/validate';
import { buildPageMeta, paginationSchema } from '../../utils/pagination';
import { consentService } from './consent.service';

const listSchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  channel: z.enum(['EMAIL', 'SMS', 'PUSH', 'PHONE', 'DIRECT_MAIL']).optional(),
  purpose: z.enum(['MARKETING', 'TRANSACTIONAL', 'ANALYTICS', 'PROFILING']).optional(),
  status: z.enum(['GRANTED', 'WITHDRAWN', 'PENDING', 'EXPIRED']).optional(),
  currentOnly: z.enum(['true', 'false']).optional(),
});

const changeSchema = z.object({
  customerCode: z.string().regex(/^CUS-\d{6}$/, 'customerCode must look like CUS-000001'),
  channel: z.enum(['EMAIL', 'SMS', 'PUSH', 'PHONE', 'DIRECT_MAIL']),
  purpose: z.enum(['MARKETING', 'TRANSACTIONAL', 'ANALYTICS', 'PROFILING']),
  status: z.enum(['GRANTED', 'WITHDRAWN']),
  source: z.string().max(60).optional(),
  notes: z.string().max(500).optional(),
  effectiveFrom: z.string().datetime().optional(),
});

export const consentRouter = Router();

consentRouter.get(
  '/',
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listSchema>;
    const { rows, total } = await consentService.list(
      {
        search: q.search,
        channel: q.channel,
        purpose: q.purpose,
        status: q.status,
        currentOnly: q.currentOnly === 'true',
      },
      q.page,
      q.pageSize,
    );
    res.json({ data: rows, meta: buildPageMeta(q.page, q.pageSize, total) });
  }),
);

consentRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    res.json({ data: await consentService.summary() });
  }),
);

consentRouter.get(
  '/customer/:customerCode',
  asyncHandler(async (req, res) => {
    res.json({ data: await consentService.history(req.params.customerCode) });
  }),
);

consentRouter.post(
  '/',
  validate(changeSchema, 'body'),
  asyncHandler(async (req, res) => {
    const result = await consentService.recordChange(req.body, req.body?.actor ?? 'api');
    res.status(201).json({ data: result });
  }),
);
