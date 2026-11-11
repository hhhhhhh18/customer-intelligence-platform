import { Router } from 'express';
import { z } from 'zod';
import { prisma, Prisma } from '../../db/prisma';
import { asyncHandler } from '../../middleware/error-handler';
import { validate } from '../../middleware/validate';
import { buildPageMeta, paginationSchema } from '../../utils/pagination';
import { notFound } from '../../utils/errors';

const listSchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED', 'RETURNED', 'PARTIALLY_RETURNED']).optional(),
  customerCode: z.string().regex(/^CUS-\d{6}$/).optional(),
  channel: z.enum(['WEB', 'MOBILE_APP', 'STORE', 'PHONE', 'MARKETPLACE']).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  withReturnsOnly: z.enum(['true', 'false']).optional(),
});

export const ordersRouter = Router();

ordersRouter.get(
  '/',
  validate(listSchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listSchema>;
    const where: Prisma.OrderWhereInput = {};
    if (q.status) where.status = q.status;
    if (q.channel) where.channel = q.channel;
    if (q.customerCode) where.customer = { customerCode: q.customerCode };
    if (q.from || q.to) {
      where.orderDate = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }
    if (q.withReturnsOnly === 'true') where.returnedAmount = { gt: 0 };

    const [total, rows] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { orderDate: 'desc' },
        include: {
          customer: { select: { customerCode: true, firstName: true, lastName: true } },
          _count: { select: { orderLines: true } },
        },
      }),
    ]);

    res.json({ data: rows, meta: buildPageMeta(q.page, q.pageSize, total) });
  }),
);

ordersRouter.get(
  '/:orderCode',
  asyncHandler(async (req, res) => {
    const order = await prisma.order.findUnique({
      where: { orderCode: req.params.orderCode },
      include: {
        customer: { select: { customerCode: true, firstName: true, lastName: true, email: true } },
        orderLines: { include: { product: { select: { name: true, productCode: true, category: { select: { name: true } } } } } },
        outcomes: { select: { outcomeCode: true, status: true, revenueAttributed: true } },
      },
    });
    if (!order) throw notFound(`Order ${req.params.orderCode} not found`);
    res.json({ data: order });
  }),
);
