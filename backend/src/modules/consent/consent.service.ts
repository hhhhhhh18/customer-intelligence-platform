import { prisma, Prisma } from '../../db/prisma';
import { consentCode } from '../../utils/ids';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { auditService } from '../audit/audit.service';
import { logger } from '../../utils/logger';

export interface ConsentFilters {
  search?: string;
  channel?: string;
  purpose?: string;
  status?: string;
  currentOnly?: boolean;
}

export interface ConsentChangeInput {
  customerCode: string;
  channel: 'EMAIL' | 'SMS' | 'PUSH' | 'PHONE' | 'DIRECT_MAIL';
  purpose: 'MARKETING' | 'TRANSACTIONAL' | 'ANALYTICS' | 'PROFILING';
  status: 'GRANTED' | 'WITHDRAWN';
  source?: string;
  notes?: string;
  effectiveFrom?: string;
}

export class ConsentService {
  async list(filters: ConsentFilters, page: number, pageSize: number) {
    const where: Prisma.ConsentWhereInput = {};
    if (filters.channel) where.channel = filters.channel as never;
    if (filters.purpose) where.purpose = filters.purpose as never;
    if (filters.status) where.status = filters.status as never;
    if (filters.currentOnly) where.effectiveTo = null;
    if (filters.search) {
      const term = filters.search.trim();
      where.customer = {
        OR: [
          { customerCode: { contains: term, mode: 'insensitive' } },
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ],
      };
    }

    const [total, rows] = await Promise.all([
      prisma.consent.count({ where }),
      prisma.consent.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ customerId: 'asc' }, { effectiveFrom: 'desc' }],
        include: {
          customer: {
            select: { customerCode: true, firstName: true, lastName: true, email: true, preferredChannel: true },
          },
        },
      }),
    ]);
    return { rows, total, page, pageSize };
  }

  async history(customerCode: string) {
    const customer = await prisma.customer.findUnique({ where: { customerCode } });
    if (!customer) throw notFound(`Customer ${customerCode} not found`);
    const rows = await prisma.consent.findMany({
      where: { customerId: customer.id },
      orderBy: [{ channel: 'asc' }, { effectiveFrom: 'desc' }],
    });
    return { customer: { customerCode: customer.customerCode, preferredChannel: customer.preferredChannel }, history: rows };
  }

  /**
   * Append-only consent change.  The previous record is closed with an
   * effectiveTo timestamp; it is never updated in place or deleted.
   */
  async recordChange(input: ConsentChangeInput, actor = 'analyst') {
    const customer = await prisma.customer.findUnique({ where: { customerCode: input.customerCode } });
    if (!customer) throw notFound(`Customer ${input.customerCode} not found`);

    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
    if (Number.isNaN(effectiveFrom.getTime())) throw badRequest('effectiveFrom is not a valid date');

    const current = await prisma.consent.findFirst({
      where: { customerId: customer.id, channel: input.channel, purpose: input.purpose, effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (current && current.status === input.status) {
      throw conflict(
        `Consent for ${input.purpose}/${input.channel} is already ${input.status} (${current.consentCode}). Record a different state instead of duplicating history.`,
      );
    }
    if (current && effectiveFrom <= current.effectiveFrom) {
      throw badRequest('effectiveFrom must be after the current consent record\'s effectiveFrom');
    }

    const sequenceRows = await prisma.$queryRaw<Array<{ max: number | null }>>`
      SELECT COALESCE(MAX(CAST(SUBSTRING("consentCode" FROM 5) AS INTEGER)), 0) AS max FROM consents
    `;
    const nextCode = consentCode(Number(sequenceRows[0]?.max ?? 0) + 1);

    const result = await prisma.$transaction(async (tx) => {
      if (current) {
        await tx.consent.update({
          where: { id: current.id },
          data: { effectiveTo: effectiveFrom },
        });
      }
      const created = await tx.consent.create({
        data: {
          consentCode: nextCode,
          customerId: customer.id,
          channel: input.channel,
          purpose: input.purpose,
          status: input.status,
          source: input.source ?? 'AGENT_CONSOLE',
          effectiveFrom,
          withdrawnAt: input.status === 'WITHDRAWN' ? effectiveFrom : null,
          notes: input.notes ?? null,
        },
      });
      return created;
    });

    let suppressedRecommendations = 0;
    if (input.status === 'WITHDRAWN' && input.purpose === 'MARKETING') {
      const affected = await prisma.recommendation.findMany({
        where: {
          customerId: customer.id,
          eligibility: 'ELIGIBLE',
          action: { requiresMarketingConsent: true, channel: input.channel as never },
        },
        include: { action: { select: { name: true } } },
      });

      for (const recommendation of affected) {
        await prisma.recommendation.update({
          where: { id: recommendation.id },
          data: { eligibility: 'SUPPRESSED', suppressionResult: 'SUPPRESSED_CONSENT', status: 'SUPPRESSED' },
        });
        await prisma.recommendationReason.create({
          data: {
            recommendationId: recommendation.id,
            reasonCode: 'CONSENT_WITHDRAWN_LIVE',
            label: 'Suppressed after live consent withdrawal',
            detail: `Marketing consent for ${input.channel} was withdrawn on ${effectiveFrom.toISOString().slice(0, 10)}, so "${recommendation.action.name}" is no longer eligible to execute.`,
            weight: new Prisma.Decimal(6),
          },
        });
        suppressedRecommendations += 1;
      }

      await auditService.record({
        actor,
        action: 'MARKETING_CONSENT_WITHDRAWN',
        entityType: 'Customer',
        entityId: customer.customerCode,
        customerId: customer.id,
        payload: {
          channel: input.channel,
          consentCode: result.consentCode,
          suppressedRecommendations,
        },
      });
    } else {
      await auditService.record({
        actor,
        action: 'CONSENT_RECORDED',
        entityType: 'Customer',
        entityId: customer.customerCode,
        customerId: customer.id,
        payload: {
          channel: input.channel,
          purpose: input.purpose,
          status: input.status,
          consentCode: result.consentCode,
          previousConsentCode: current?.consentCode ?? null,
        },
      });
    }

    logger.info('consent recorded', {
      customer: customer.customerCode,
      channel: input.channel,
      status: input.status,
      suppressedRecommendations,
    });

    return { consent: result, previousConsentCode: current?.consentCode ?? null, suppressedRecommendations };
  }

  async summary() {
    const rows = await prisma.$queryRaw<
      Array<{ channel: string; granted: number; withdrawn: number; pending: number }>
    >`
      SELECT channel::text AS channel,
             COUNT(*) FILTER (WHERE status = 'GRANTED')::int AS granted,
             COUNT(*) FILTER (WHERE status = 'WITHDRAWN')::int AS withdrawn,
             COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending
      FROM consents
      WHERE "effectiveTo" IS NULL AND purpose = 'MARKETING'
      GROUP BY channel
      ORDER BY channel
    `;

    const totalCustomers = await prisma.customer.count();
    const reachable = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(DISTINCT "customerId")::int AS count FROM consents
      WHERE purpose = 'MARKETING' AND channel = 'EMAIL' AND status = 'GRANTED' AND "effectiveTo" IS NULL
    `;

    return {
      byChannel: rows,
      totalCustomers,
      emailReachableCustomers: Number(reachable[0]?.count ?? 0),
      suppressionRate: totalCustomers
        ? Number((((totalCustomers - Number(reachable[0]?.count ?? 0)) / totalCustomers) * 100).toFixed(2))
        : 0,
    };
  }
}

export const consentService = new ConsentService();

