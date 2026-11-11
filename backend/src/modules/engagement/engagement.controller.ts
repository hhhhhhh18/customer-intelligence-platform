import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../middleware/error-handler';
import { validate } from '../../middleware/validate';

export const engagementRouter = Router();

engagementRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const [byType, byChannel, byMonth, total] = await Promise.all([
      prisma.engagementEvent.groupBy({ by: ['eventType'], _count: { _all: true } }),
      prisma.engagementEvent.groupBy({ by: ['channel'], _count: { _all: true } }),
      prisma.$queryRaw<Array<{ month: string; events: number }>>`
        SELECT to_char(date_trunc('month', "occurredAt"), 'YYYY-MM') AS month, COUNT(*)::int AS events
        FROM engagement_events
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 12
      `,
      prisma.engagementEvent.count(),
    ]);

    res.json({
      data: {
        total,
        byType: byType.map((r) => ({ eventType: r.eventType, count: r._count._all })).sort((a, b) => b.count - a.count),
        byChannel: byChannel.map((r) => ({ channel: r.channel, count: r._count._all })).sort((a, b) => b.count - a.count),
        byMonth: byMonth.reverse(),
      },
    });
  }),
);

engagementRouter.get(
  '/recent',
  validate(
    z.object({
      customerCode: z.string().regex(/^CUS-\d{6}$/).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    }),
    'query',
  ),
  asyncHandler(async (req, res) => {
    const { customerCode, limit } = req.query as unknown as { customerCode?: string; limit: number };
    const events = await prisma.engagementEvent.findMany({
      where: customerCode ? { customer: { customerCode } } : {},
      orderBy: { occurredAt: 'desc' },
      take: limit,
      include: { customer: { select: { customerCode: true, firstName: true, lastName: true } } },
    });
    res.json({ data: events });
  }),
);
