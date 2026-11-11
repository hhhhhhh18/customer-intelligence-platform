import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('API contract', () => {
  it('GET /api/health returns service status', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body.status).toBe('ok');
  });

  it('GET /api/dashboard/summary returns database-backed KPIs', async () => {
    const response = await request(app).get('/api/dashboard/summary').expect(200);
    const kpis = response.body.data.kpis;
    expect(typeof kpis.totalCustomers).toBe('number');
    expect(kpis.totalCustomers).toBeGreaterThan(0);
    expect(kpis.totalNetRevenue).toBeGreaterThan(0);
    expect(Array.isArray(response.body.data.segmentDistribution)).toBe(true);
    expect(response.body.data.purchaseTrend.length).toBe(12);
  });

  it('GET /api/customers paginates with metadata', async () => {
    const response = await request(app).get('/api/customers?page=2&pageSize=5').expect(200);
    expect(response.body.data).toHaveLength(5);
    expect(response.body.meta.page).toBe(2);
    expect(response.body.meta.total).toBeGreaterThan(5);
  });

  it('rejects an out-of-range page size with 400', async () => {
    const response = await request(app).get('/api/customers?pageSize=5000').expect(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
    expect(Array.isArray(response.body.error.details)).toBe(true);
  });

  it('returns 404 for an unknown customer', async () => {
    await request(app).get('/api/customers/CUS-999999').expect(404);
  });

  it('returns all nine configured segments', async () => {
    const response = await request(app).get('/api/segments').expect(200);
    expect(response.body.data).toHaveLength(9);
    const champions = response.body.data.find((s: { slug: string }) => s.slug === 'champions');
    expect(champions.customerCount).toBeGreaterThan(0);
    expect(champions.ruleVersion).toBe('rfm-v1.0.0');
  });

  it('filters recommendations by eligibility', async () => {
    const response = await request(app).get('/api/recommendations?eligibility=SUPPRESSED&pageSize=5').expect(200);
    expect(response.body.data.every((row: { eligibility: string }) => row.eligibility === 'SUPPRESSED')).toBe(true);
  });

  it('exposes exception categories required by the brief', async () => {
    const response = await request(app).get('/api/exceptions?pageSize=50').expect(200);
    const categories = new Set(response.body.data.map((row: { category: string }) => row.category));
    expect(categories.has('SEGMENT_CONFLICT')).toBe(true);
    expect(categories.has('CONSENT_VIOLATION')).toBe(true);
    expect(categories.has('RETURN_NOT_NETTED')).toBe(true);
    expect(categories.has('OUTCOME_ATTRIBUTION')).toBe(true);
  });

  it('rejects an invalid consent payload', async () => {
    const response = await request(app)
      .post('/api/consent')
      .send({ customerCode: 'not-a-code', channel: 'EMAIL', purpose: 'MARKETING', status: 'GRANTED' })
      .expect(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
  });

  it('rejects a duplicate consent state with 409 (append-only history)', async () => {
    const granted = await prisma.consent.findFirst({
      where: { purpose: 'MARKETING', channel: 'EMAIL', status: 'GRANTED', effectiveTo: null },
      include: { customer: true },
    });
    const response = await request(app)
      .post('/api/consent')
      .send({
        customerCode: granted!.customer.customerCode,
        channel: 'EMAIL',
        purpose: 'MARKETING',
        status: 'GRANTED',
      })
      .expect(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('returns outcome metrics with real aggregates', async () => {
    const response = await request(app).get('/api/outcomes/metrics').expect(200);
    expect(response.body.data.totalOutcomes).toBeGreaterThan(0);
    expect(response.body.data.note).toMatch(/causal/i);
  });

  it('returns data-quality results with ground-truth evaluation', async () => {
    const response = await request(app).get('/api/data-quality').expect(200);
    expect(response.body.data.summary.checks.length).toBeGreaterThan(20);
    expect(response.body.data.summary.evaluation.anomalies.detected).toBe(4);
  });

  it('rejects malformed order references in outcome recording', async () => {
    const response = await request(app)
      .post('/api/outcomes')
      .send({ recommendationCode: 'bad', actionSlug: 'loyalty-reward', status: 'SUCCESS', channel: 'EMAIL' })
      .expect(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
  });
});
