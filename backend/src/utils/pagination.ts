import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sortBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type Pagination = z.infer<typeof paginationSchema>;

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
}

export function buildPageMeta(page: number, pageSize: number, total: number): PageMeta {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { page, pageSize, total, totalPages, hasNext: page < totalPages };
}

export const paginationArgs = (p: Pagination) => ({
  skip: (p.page - 1) * p.pageSize,
  take: p.pageSize,
});
