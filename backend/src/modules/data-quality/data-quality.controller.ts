import { Router } from 'express';
import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { asyncHandler } from '../../middleware/error-handler';
import { validate } from '../../middleware/validate';
import { badRequest } from '../../utils/errors';
import { getJob, listJobs, startJob } from '../../utils/job-runner';
import { validationService } from './validation.service';
import { loadDataset } from '../../scripts/load-dataset';
import { injectAnomalies } from '../../scripts/inject-anomalies';
import { segmentationService } from '../segmentation/segmentation.service';
import { recommendationService } from '../recommendations/recommendation.service';
import { outcomeService } from '../outcomes/outcome.service';
import { detectorService } from '../exceptions/detector.service';

const execFileAsync = promisify(execFile);
const DATA_ENGINE_DIR = path.resolve(process.cwd(), '..', 'data-engine');

export const dataQualityRouter = Router();

dataQualityRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const run = await validationService.latest();
    if (!run) {
      res.json({ data: null, message: 'No validation run yet. Trigger POST /api/data/validate.' });
      return;
    }
    const issues = await prisma.dataQualityIssue.findMany({ where: { runId: run.id }, orderBy: { ruleId: 'asc' } });
    const generation = await prisma.generationRun.findFirst({ orderBy: { startedAt: 'desc' } });
    res.json({
      data: {
        ...run,
        issues,
        volumes: await validationService.volumes(),
        generation,
        catalogue: validationService.checkCatalogue(),
      },
    });
  }),
);

dataQualityRouter.get(
  '/history',
  asyncHandler(async (_req, res) => {
    res.json({ data: await validationService.history() });
  }),
);

dataQualityRouter.post(
  '/run',
  asyncHandler(async (_req, res) => {
    const result = await validationService.run({ actor: 'api' });
    res.status(201).json({ data: result });
  }),
);

// Alias required by the API contract: POST /api/data/validate
dataQualityRouter.post(
  '/validate',
  asyncHandler(async (_req, res) => {
    const result = await validationService.run({ actor: 'api' });
    res.status(201).json({ data: result });
  }),
);

const generateSchema = z.object({
  profile: z.enum(['small', 'medium', 'full']).default('small'),
  seed: z.number().int().min(1).max(2_147_483_647).default(20261022),
  runPipeline: z.boolean().default(true),
  referenceDate: z.string().date().optional(),
});

/**
 * Full regeneration job: python generator -> COPY load -> segmentation ->
 * recommendations -> outcomes -> anomaly injection -> detection -> validation.
 * Returns 202 immediately with a job id; poll GET /api/data/jobs/:id.
 */
dataQualityRouter.post(
  '/generate',
  validate(generateSchema, 'body'),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof generateSchema>;
    const job = startJob(`generate:${body.profile}:${body.seed}`, async (log) => {
      log(`generating ${body.profile} dataset with seed ${body.seed}`);
      const args = ['main.py', '--profile', body.profile, '--seed', String(body.seed)];
      if (body.referenceDate) args.push('--reference-date', body.referenceDate);
      const { stdout } = await execFileAsync('python', args, { cwd: DATA_ENGINE_DIR, maxBuffer: 20 * 1024 * 1024 });
      log(stdout.trim().split('\n').slice(-3).join(' | '));

      log('loading dataset into PostgreSQL');
      const loaded = await loadDataset();
      log(`loaded ${loaded.counts.customers} customers / ${loaded.counts.orders} orders`);

      if (body.runPipeline) {
        log('running segmentation');
        const segmentation = await segmentationService.run({ actor: 'data-api' });
        log(`scored ${segmentation.customersScored} customers`);
        log('running recommendations');
        const recommendations = await recommendationService.run({ actor: 'data-api' });
        log(`${recommendations.processed} recommendations (${recommendations.eligible} eligible)`);
        log('simulating outcomes');
        await outcomeService.simulate({ actor: 'data-api' });
        log('injecting labelled anomalies');
        await injectAnomalies();
        log('running detectors');
        await detectorService.runAll();
        log('validating');
        const validation = await validationService.run({ actor: 'data-api' });
        log(`validation score ${validation.score}%`);
        return { loaded, segmentation, recommendations, validation };
      }
      return { loaded };
    });
    res.status(202).json({ data: { jobId: job.id, status: job.status } });
  }),
);

dataQualityRouter.get(
  '/jobs',
  asyncHandler(async (_req, res) => {
    res.json({ data: listJobs() });
  }),
);

dataQualityRouter.get(
  '/jobs/:id',
  asyncHandler(async (req, res) => {
    const job = getJob(req.params.id);
    if (!job) throw badRequest(`Unknown job ${req.params.id}`);
    res.json({ data: job });
  }),
);

