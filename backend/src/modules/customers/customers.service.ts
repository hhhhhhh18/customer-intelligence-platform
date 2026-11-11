import { notFound } from '../../utils/errors';
import { CustomersRepository, CustomerFilters } from './customers.repository';

export class CustomersService {
  constructor(private readonly repo = new CustomersRepository()) {}

  async list(filters: CustomerFilters, page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    const { rows, total } = await this.repo.findMany(filters, skip, pageSize);
    return { rows, total, page, pageSize };
  }

  async detail(idOrCode: string) {
    const customer = await this.repo.findByIdOrCode(idOrCode);
    if (!customer) throw notFound(`Customer ${idOrCode} not found`);

    const [metrics, orders, events, cases, consents, memberships, recommendations, exceptions] = await Promise.all([
      this.repo.aggregateMetrics(customer.id),
      this.repo.ordersFor(customer.id),
      this.repo.eventsFor(customer.id),
      this.repo.casesFor(customer.id),
      this.repo.consentsFor(customer.id),
      this.repo.membershipsFor(customer.id),
      this.repo.recommendationsFor(customer.id),
      this.repo.exceptionsFor(customer.id),
    ]);

    const activeMembership = memberships.find((m) => m.status === 'ACTIVE') ?? null;
    const currentConsents = consents.filter((c) => c.effectiveTo === null);
    const marketingEmail = currentConsents.find((c) => c.purpose === 'MARKETING' && c.channel === 'EMAIL');

    return {
      customer,
      metrics: {
        totalOrders: Number(metrics?.orders ?? 0),
        netSpend: Number(metrics?.net_spend ?? 0),
        refunds: Number(metrics?.refunds ?? 0),
        returnCount: Number(metrics?.return_count ?? 0),
        lastPurchase: metrics?.last_purchase ?? null,
        lifetimeValueBand:
          Number(metrics?.net_spend ?? 0) > 100000 ? 'HIGH' : Number(metrics?.net_spend ?? 0) > 25000 ? 'MEDIUM' : 'LOW',
      },
      rfm: activeMembership
        ? {
            rScore: activeMembership.rScore,
            fScore: activeMembership.fScore,
            mScore: activeMembership.mScore,
            rfmScore: activeMembership.rfmScore,
            recencyDays: activeMembership.recencyDays,
            frequency: activeMembership.frequency,
            monetary: Number(activeMembership.monetary),
            serviceCost: Number(activeMembership.serviceCost),
            assignmentReason: activeMembership.assignmentReason,
            assignedAt: activeMembership.assignedAt,
            ruleVersion: activeMembership.ruleVersion,
          }
        : null,
      segment: activeMembership
        ? {
            name: activeMembership.segment.name,
            slug: activeMembership.segment.slug,
            segmentCode: activeMembership.segment.segmentCode,
            membershipCode: activeMembership.membershipCode,
            conflictingMemberships: memberships.filter((m) => m.status === 'ACTIVE').length > 1,
          }
        : null,
      membershipHistory: memberships,
      orders,
      engagement: events,
      supportCases: cases,
      consents,
      contactPreferences: {
        preferredChannel: customer.preferredChannel,
        emailMarketing: marketingEmail?.status ?? 'NONE',
        reachableChannels: currentConsents
          .filter((c) => c.status === 'GRANTED' && c.purpose === 'MARKETING')
          .map((c) => c.channel),
      },
      recommendations,
      outcomes: recommendations.flatMap((r) => r.outcomes.map((o) => ({ ...o, recommendationCode: r.recommendationCode }))),
      exceptions,
    };
  }
}

export const customersService = new CustomersService();
