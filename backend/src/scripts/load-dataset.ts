/**
 * Bulk loader: data-engine/exports/*.csv -> PostgreSQL.
 *
 * Uses PostgreSQL COPY (streamed) instead of row-by-row inserts, because the
 * full profile is ~1.7M child rows and individual inserts would take hours.
 * Loading is destructive by design: it replaces the analytics dataset and is
 * therefore only ever run by an operator, never by an end-user API call.
 */
import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { pipeline } from 'stream/promises';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { ensureSegmentRules } from '../modules/segmentation/segmentation.service';
import { ensureActionCatalog } from '../modules/recommendations/recommendation.service';

const EXPORT_DIR = path.resolve(process.cwd(), '..', 'data-engine', 'exports');
const GROUND_TRUTH_DIR = path.resolve(process.cwd(), '..', 'data-engine', 'ground_truth');

interface Manifest {
  profile: 'SMALL' | 'MEDIUM' | 'FULL' | 'small' | 'medium' | 'full';
  seed: number;
  referenceDate: string;
  datasetHash: string;
  counts: Record<string, number>;
  files: Record<string, { path: string; rows: number; sha256: string }>;
}

const TABLE_ORDER: Array<{ csv: string; table: string; columns: string[] }> = [
  {
    csv: 'product_categories',
    table: 'product_categories',
    columns: ['id', 'code', 'name', 'parentId'],
  },
  {
    csv: 'products',
    table: 'products',
    columns: ['id', 'productCode', 'name', 'categoryId', 'brand', 'unitPrice', 'unitCost', 'isReturnable', 'launchDate', 'isActive'],
  },
  {
    csv: 'customers',
    table: 'customers',
    columns: [
      'id', 'customerCode', 'firstName', 'lastName', 'email', 'phone', 'country', 'city', 'region',
      'signupDate', 'birthDate', 'lifecycle', 'acquisition', 'loyaltyTier', 'preferredChannel',
    ],
  },
  {
    csv: 'orders',
    table: 'orders',
    columns: [
      'id', 'orderCode', 'customerId', 'orderDate', 'status', 'channel', 'currency', 'subtotal',
      'discountAmount', 'shippingAmount', 'taxAmount', 'grossTotal', 'returnedAmount', 'netTotal',
      'itemCount', 'returnReason', 'campaignId',
    ],
  },
  {
    csv: 'order_lines',
    table: 'order_lines',
    columns: [
      'id', 'orderId', 'productId', 'customerId', 'lineNumber', 'quantity', 'unitPrice',
      'lineDiscount', 'lineTotal', 'returnedQuantity', 'refundAmount', 'netLineTotal',
    ],
  },
  {
    csv: 'engagement_events',
    table: 'engagement_events',
    columns: ['id', 'customerId', 'eventType', 'channel', 'sessionId', 'occurredAt', 'pagePath', 'deviceType', 'campaignId'],
  },
  {
    csv: 'support_cases',
    table: 'support_cases',
    columns: [
      'id', 'caseCode', 'customerId', 'openedAt', 'closedAt', 'status', 'priority', 'category',
      'channel', 'subject', 'isEscalated', 'handlingCost', 'satisfactionScore', 'resolutionNotes',
    ],
  },
  {
    csv: 'consents',
    table: 'consents',
    columns: [
      'id', 'consentCode', 'customerId', 'channel', 'purpose', 'status', 'source', 'effectiveFrom',
      'effectiveTo', 'withdrawnAt', 'recordedAt', 'notes',
    ],
  },
];

const TRUNCATE_SQL = `
  TRUNCATE TABLE
    action_outcomes, recommendation_reasons, recommendations, exception_records, audit_events,
    segment_memberships, consents, support_cases, engagement_events, order_lines, orders,
    products, product_categories, customers, data_quality_issues, data_quality_runs,
    segmentation_runs, recommendation_runs, generation_runs, segment_rules, action_catalog
  RESTART IDENTITY CASCADE
`;

async function copyTable(client: Client, csvPath: string, table: string, columns: string[]) {
  const columnList = columns.map((c) => `"${c}"`).join(', ');
  const copyStream = copyFrom(
    `COPY ${table} (${columnList}) FROM STDIN WITH (FORMAT csv, HEADER true, NULL '\\N')`,
  ) as unknown as NodeJS.WritableStream;
  const writable = client.query(copyStream as never) as unknown as NodeJS.WritableStream;
  await pipeline(fs.createReadStream(csvPath), writable as never);
}

export async function loadDataset(): Promise<{ counts: Record<string, number>; datasetHash: string; durationMs: number }> {
  const startedAt = Date.now();
  const manifestPath = path.join(EXPORT_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No dataset found at ${EXPORT_DIR}. Run: python data-engine/main.py --profile small`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;

  for (const entry of TABLE_ORDER) {
    const file = path.join(EXPORT_DIR, `${entry.csv}.csv`);
    if (!fs.existsSync(file)) throw new Error(`Missing export file ${file}`);
  }

  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    console.log('[load] truncating existing analytics tables');
    await client.query(TRUNCATE_SQL);

    for (const entry of TABLE_ORDER) {
      const file = path.join(EXPORT_DIR, `${entry.csv}.csv`);
      const before = Date.now();
      await copyTable(client, file, entry.table, entry.columns);
      const rows = manifest.files[entry.csv]?.rows ?? 0;
      console.log(`[load] ${entry.table.padEnd(20)} ${String(rows).padStart(9)} rows in ${Date.now() - before}ms`);
    }

    // Explicit ids were supplied by the generator; realign sequences so later
    // inserts (recommendations, outcomes, exceptions) never collide.
    for (const entry of TABLE_ORDER) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence('${entry.table}', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM ${entry.table}), 1))`,
      );
    }

    const counts: Record<string, number> = {};
    for (const entry of TABLE_ORDER) {
      const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${entry.table}`);
      counts[entry.table] = result.rows[0].count;
      const expected = manifest.files[entry.csv]?.rows;
      if (expected !== undefined && expected !== counts[entry.table]) {
        throw new Error(`Row count mismatch for ${entry.table}: expected ${expected}, found ${counts[entry.table]}`);
      }
    }
    console.log('[load] row counts verified against manifest');
  } finally {
    await client.end();
  }

  await ensureSegmentRules();
  await ensureActionCatalog();

  const referenceDate = new Date(`${manifest.referenceDate}T00:00:00.000Z`);
  await prisma.generationRun.create({
    data: {
      runCode: `GEN-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}`,
      profile: String(manifest.profile).toUpperCase() as never,
      seed: manifest.seed,
      referenceDate,
      customerCount: manifest.counts.customers ?? 0,
      orderCount: manifest.counts.orders ?? 0,
      eventCount: manifest.counts.engagementEvents ?? 0,
      status: 'COMPLETED',
      datasetHash: manifest.datasetHash,
      completedAt: new Date(),
      config: {
        profile: manifest.profile,
        seed: manifest.seed,
        referenceDate: manifest.referenceDate,
        files: manifest.files,
        groundTruthPath: path.relative(process.cwd(), GROUND_TRUTH_DIR),
      },
    },
  });

  return {
    counts: {
      customers: manifest.counts.customers ?? 0,
      orders: manifest.counts.orders ?? 0,
      orderLines: manifest.counts.orderLines ?? 0,
      engagementEvents: manifest.counts.engagementEvents ?? 0,
      supportCases: manifest.counts.supportCases ?? 0,
      consents: manifest.counts.consents ?? 0,
      products: manifest.counts.products ?? 0,
    },
    datasetHash: manifest.datasetHash,
    durationMs: Date.now() - startedAt,
  };
}

if (require.main === module) {
  loadDataset()
    .then(async (result) => {
      console.log(`[load] completed in ${(result.durationMs / 1000).toFixed(1)}s | hash ${result.datasetHash}`);
      console.log('[load] counts', result.counts);
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('[load] failed', error);
      await prisma.$disconnect();
      process.exit(1);
    });
}

