import { prisma } from '../db/prisma';
import { segmentationService } from '../modules/segmentation/segmentation.service';

async function main() {
  const summary = await segmentationService.run({ actor: 'cli' });
  console.log('[segmentation] run', summary.runCode);
  console.log(
    `[segmentation] scored=${summary.customersScored} created=${summary.membershipsCreated} superseded=${summary.membershipsSuperseded} unchanged=${summary.unchanged} unassigned=${summary.unassigned} conflicts=${summary.conflictsDetected} in ${summary.durationMs}ms`,
  );
  console.table(summary.segmentCounts);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[segmentation] failed', error);
    await prisma.$disconnect();
    process.exit(1);
  });
