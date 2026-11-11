import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error-handler';
import { validate } from '../../middleware/validate';
import { buildPageMeta, paginationSchema } from '../../utils/pagination';
import { customersService } from './customers.service';

const listSchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  segmentSlug: z.string().max(48).optional(),
  consentStatus: z.enum(['GRANTED', 'WITHDRAWN', 'NONE']).optional(),
  lifecycle: z.enum(['ACTIVE', 'DORMANT', 'CHURNED', 'BLOCKED']).optional(),
  minRfm: z.coerce.number().int().min(111).max(555).optional(),
  maxRfm: z.coerce.number().int().min(111).max(555).optional(),
  hasOpenCase: z.enum(['true', 'false']).optional(),
  sortBy: z.enum(['customerCode', 'name', 'signupDate', 'totalOrders', 'netSpend', 'lastPurchase', 'rfmScore']).optional(),
});

export const customersRouter = Router();

customersRouter.get(
  '/',
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as z.infer<typeof listSchema>;
    const { rows, total } = await customersService.list(
      {
        search: query.search,
        segmentSlug: query.segmentSlug,
        consentStatus: query.consentStatus,
        lifecycle: query.lifecycle,
        minRfm: query.minRfm,
        maxRfm: query.maxRfm,
        hasOpenCase: query.hasOpenCase === 'true',
        sortBy: query.sortBy,
        sortDir: query.sortDir,
      },
      query.page,
      query.pageSize,
    );
    res.json({ data: rows, meta: buildPageMeta(query.page, query.pageSize, total) });
  }),
);

customersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const detail = await customersService.detail(req.params.id);
    res.json({ data: detail });
  }),
);
