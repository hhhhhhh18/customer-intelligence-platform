/**
 * End-to-end pipeline: (optional) load -> segment -> recommend -> outcomes ->
 * inject labelled anomalies -> detect -> validate.
 *
 * Every stage is idempotent enough to be re-run, and every stage reports real
 * counts from the database.
 */
import { prisma } from '../db/prisma';
import { loadDataset } from './load-dataset';
import { injectAnomalies } from './inject-anomalies';
import { segmentationService } from '../modules/segmentation/segmentation.service';
import { recommendationService } from '../modules/recommendations/recommendation.service';
import { outcomeService } from '../modules/outcomes/outcome.service';
import { detectorService } from '../modules/exceptions/detector.service';
import { validationService } from '../modules/data-quality/validation.service';

async function main() {
  const load = process.argv.includes('--load');

  if (load) {
    console.log('\n=== 1. Load dataset ===');
    const loaded = await loadDataset();
    console.log('[pipeline] loaded', loaded.counts);
  }

  console.log('\n=== 2. Segmentation ===');
  const segmentation = await segmentationService.run({ actor: 'pipeline' });
  console.log(
    `[pipeline] scored ${segmentation.customersScored} customers, created ${segmentation.membershipsCreated} memberships, conflicts ${segmentation.conflictsDetected}`,
  );

  console.log('\n=== 3. Recommendations ===');
  const recommendations = await recommendationService.run({ actor: 'pipeline' });
  console.log(
    `[pipeline] ${recommendations.processed} recommendations: eligible ${recommendations.eligible}, suppressed ${recommendations.suppressed}, no-action ${recommendations.noAction}`,
  );

  console.log('\n=== 4. Outcome simulation ===');
  const outcomes = await outcomeService.simulate({ actor: 'pipeline' });
  console.log(
    `[pipeline] outcomes created ${outcomes.created} (success ${outcomes.success}, failure ${outcomes.failure}, no response ${outcomes.noResponse})`,
  );

  console.log('\n=== 5. Inject labelled anomalies ===');
  const injected = await injectAnomalies();
  console.log('[pipeline]', injected);

  console.log('\n=== 6. Detect anomalies ===');
  const detection = await detectorService.runAll();
  console.table(detection.detectors);

  console.log('\n=== 7. Validate ===');
  const validation = await validationService.run({ actor: 'pipeline' });
  console.log(
    `[pipeline] data quality score ${validation.score}% | checks ${validation.checksPassed} passed, ${validation.checksFailed} failed, ${validation.warningCount} expected anomalies`,
  );
  console.log('[pipeline] ground truth', JSON.stringify(validation.evaluation?.anomalies));
  console.log('[pipeline] segmentation accuracy', validation.evaluation?.segmentation.accuracy, '%');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[pipeline] failed', error);
    await prisma.$disconnect();
    process.exit(1);
  });
