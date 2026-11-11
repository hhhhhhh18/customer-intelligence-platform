import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/error-handler';
import { validate } from '../../middleware/validate';
import { segmentationService } from './segmentation.service';

export const segmentationRouter = Router();

segmentationRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const segments = await segmentationService.listSegments();
    res.json({ data: segments });
  }),
);

segmentationRouter.get(
  '/conflicts',
  asyncHandler(async (_req, res) => {
    const conflicts = await segmentationService.conflicts();
    res.json({ data: conflicts });
  }),
);

segmentationRouter.get(
  '/runs',
  asyncHandler(async (_req, res) => {
    res.json({ data: await segmentationService.runs() });
  }),
);

const runSchema = z.object({
  asOfDate: z.string().date().optional(),
  actor: z.string().max(60).optional(),
});

segmentationRouter.post(
  '/run',
  validate(runSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof runSchema>;
    const summary = await segmentationService.run({
      asOfDate: body.asOfDate ? new Date(`${body.asOfDate}T00:00:00.000Z`) : undefined,
      actor: body.actor ?? 'api',
    });
    res.status(201).json({ data: summary });
  }),
);

segmentationRouter.get(
  '/customers/:customerId/memberships',
  asyncHandler(async (req, res) => {
    const memberships = await segmentationService.membershipHistory(Number(req.params.customerId));
    res.json({ data: memberships });
  }),
);
