import { Router } from 'express';
import { z } from 'zod';
import { prisma, Prisma } from '../../db/prisma';
import { asyncHandler } from '../../middleware/error-handler';
import { validate } from '../../middleware/validate';
import { buildPageMeta, paginationSchema } from '../../utils/pagination';

const listSchema = paginationSchema.extend({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ESCALATED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  customerCode: z.string().regex(/^CUS-\d{6}$/).optional(),
  unresolvedOnly: z.enum(['true', 'false']).optional(),
});

export const supportRouter = Router();

supportRouter.get(
  '/cases',
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listSchema>;
    const where: Prisma.SupportCaseWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.priority) where.priority = q.priority;
    if (q.customerCode) where.customer = { customerCode: q.customerCode };
    if (q.unresolvedOnly === 'true') where.status = { in: ['OPEN', 'IN_PROGRESS', 'ESCALATED'] };

    const [total, rows] = await Promise.all([
      prisma.supportCase.count({ where }),
      prisma.supportCase.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { openedAt: 'desc' },
        include: { customer: { select: { customerCode: true, firstName: true, lastName: true } } },
      }),
    ]);
    res.json({ data: rows, meta: buildPageMeta(q.page, q.pageSize, total) });
  }),
);

supportRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.$queryRaw<
      Array<{ status: string; count: number; handling_cost: number; escalated: number }>
    >`
      SELECT status::text AS status, COUNT(*)::int AS count,
             COALESCE(SUM("handlingCost"), 0)::float8 AS handling_cost,
             COUNT(*) FILTER (WHERE "isEscalated")::int AS escalated
      FROM support_cases GROUP BY status ORDER BY count DESC
    `;
    const totals = await prisma.supportCase.aggregate({
      _sum: { handlingCost: true },
      _count: { _all: true },
      _avg: { satisfactionScore: true },
    });
    res.json({
      data: {
        byStatus: rows,
        totalCases: totals._count._all,
        totalHandlingCost: Number(totals._sum.handlingCost ?? 0),
        averageSatisfaction: totals._avg.satisfactionScore ? Number(totals._avg.satisfactionScore.toFixed(2)) : null,
      },
    });
  }),
);
