import { prisma } from '../db/prisma';
import { recommendationService } from '../modules/recommendations/recommendation.service';

async function main() {
  const summary = await recommendationService.run({ actor: 'cli' });
  console.log(
    `[recommendations] run=${summary.runCode} processed=${summary.processed} eligible=${summary.eligible} suppressed=${summary.suppressed} noAction=${summary.noAction} consentSuppressed=${summary.consentSuppressed} in ${summary.durationMs}ms`,
  );
  console.table(summary.byAction);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[recommendations] failed', error);
    await prisma.$disconnect();
    process.exit(1);
  });
