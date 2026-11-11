import { prisma, Prisma } from '../../db/prisma';

export interface ExceptionFilters {
  category?: string;
  severity?: string;
  status?: string;
  search?: string;
}

export class ExceptionsRepository {
  private buildWhere(filters: ExceptionFilters): Prisma.ExceptionRecordWhereInput {
    const where: Prisma.ExceptionRecordWhereInput = {};
    if (filters.category) where.category = filters.category as never;
    if (filters.severity) where.severity = filters.severity as never;
    if (filters.status) where.status = filters.status as never;
    if (filters.search) {
      const term = filters.search.trim();
      where.OR = [
        { entityId: { contains: term, mode: 'insensitive' } },
        { exceptionCode: { contains: term, mode: 'insensitive' } },
        { customer: { customerCode: { contains: term, mode: 'insensitive' } } },
        { customer: { firstName: { contains: term, mode: 'insensitive' } } },
        { customer: { lastName: { contains: term, mode: 'insensitive' } } },
      ];
    }
    return where;
  }

  async findMany(filters: ExceptionFilters, skip: number, take: number) {
    const where = this.buildWhere(filters);
    const [total, rows] = await Promise.all([
      prisma.exceptionRecord.count({ where }),
      prisma.exceptionRecord.findMany({
        where,
        skip,
        take,
        orderBy: [{ severity: 'asc' }, { detectedAt: 'desc' }],
        include: {
          customer: { select: { customerCode: true, firstName: true, lastName: true } },
          recommendation: { select: { recommendationCode: true } },
        },
      }),
    ]);
    return { total, rows };
  }

  async findById(id: number) {
    return prisma.exceptionRecord.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, customerCode: true, firstName: true, lastName: true, email: true } },
        recommendation: { select: { id: true, recommendationCode: true, eligibility: true, suppressionResult: true } },
      },
    });
  }

  async summary() {
    const [byCategory, bySeverity, byStatus, total] = await Promise.all([
      prisma.exceptionRecord.groupBy({ by: ['category'], _count: { _all: true } }),
      prisma.exceptionRecord.groupBy({ by: ['severity'], _count: { _all: true } }),
      prisma.exceptionRecord.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.exceptionRecord.count(),
    ]);
    return {
      total,
      byCategory: byCategory.map((r) => ({ category: r.category, count: r._count._all })),
      bySeverity: bySeverity.map((r) => ({ severity: r.severity, count: r._count._all })),
      byStatus: byStatus.map((r) => ({ status: r.status, count: r._count._all })),
    };
  }

  async nextCode(): Promise<string> {
    const rows = await prisma.$queryRaw<Array<{ max: number | null }>>`
      SELECT COALESCE(MAX(CAST(SUBSTRING("exceptionCode" FROM 5) AS INTEGER)), 0) AS max FROM exception_records
    `;
    return `EXC-${String(Number(rows[0]?.max ?? 0) + 1).padStart(6, '0')}`;
  }
}
