import express, { Express } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { requestLogger } from './middleware/request-logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { customersRouter } from './modules/customers/customers.controller';
import { segmentationRouter } from './modules/segmentation/segmentation.controller';
import { actionsRouter, recommendationsRouter } from './modules/recommendations/recommendations.controller';
import { consentRouter } from './modules/consent/consent.controller';
import { exceptionsRouter } from './modules/exceptions/exceptions.controller';
import { outcomesRouter } from './modules/outcomes/outcomes.controller';
import { dataQualityRouter } from './modules/data-quality/data-quality.controller';
import { auditRouter, dashboardRouter, pipelineRouter } from './modules/analytics/analytics.controller';
import { ordersRouter } from './modules/orders/orders.controller';
import { productsRouter } from './modules/products/products.controller';
import { engagementRouter } from './modules/engagement/engagement.controller';
import { supportRouter } from './modules/support/support.controller';

export function createApp(): Express {
  const app = express();

  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
      credentials: false,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'customer-intelligence-api', env: env.NODE_ENV, ts: new Date().toISOString() });
  });

  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/segments', segmentationRouter);
  app.use('/api/recommendations', recommendationsRouter);
  app.use('/api/actions', actionsRouter);
  app.use('/api/consent', consentRouter);
  app.use('/api/exceptions', exceptionsRouter);
  app.use('/api/outcomes', outcomesRouter);
  app.use('/api/data-quality', dataQualityRouter);
  app.use('/api/data', dataQualityRouter); // /api/data/generate, /api/data/validate alias
  app.use('/api/orders', ordersRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/engagement', engagementRouter);
  app.use('/api/support', supportRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/pipeline', pipelineRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
