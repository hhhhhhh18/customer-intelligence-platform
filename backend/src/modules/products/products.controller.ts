import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../middleware/error-handler';
import { validate } from '../../middleware/validate';

export const productsRouter = Router();

productsRouter.get(
  '/',
  validate(z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }), 'query'),
  asyncHandler(async (req, res) => {
    const { limit } = req.query as unknown as { limit: number };
    const rows = await prisma.$queryRaw<
      Array<{ productCode: string; name: string; category: string; units: number; revenue: number; refunds: number }>
    >`
      SELECT p."productCode", p.name, cat.name AS category,
             COALESCE(SUM(l.quantity), 0)::int AS units,
             COALESCE(SUM(l."lineTotal"), 0)::float8 AS revenue,
             COALESCE(SUM(l."refundAmount"), 0)::float8 AS refunds
      FROM products p
      JOIN product_categories cat ON cat.id = p."categoryId"
      LEFT JOIN order_lines l ON l."productId" = p.id
      GROUP BY p."productCode", p.name, cat.name
      ORDER BY revenue DESC
      LIMIT ${limit}
    `;
    res.json({ data: rows });
  }),
);

productsRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const categories = await prisma.productCategory.findMany({
      include: { children: { select: { id: true, code: true, name: true } }, _count: { select: { products: true } } },
      orderBy: { id: 'asc' },
    });
    res.json({ data: categories.filter((c) => c.parentId === null) , all: categories });
  }),
);
