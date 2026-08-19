import express from 'express';
import cors from 'cors';
import corsOptions from './config/cors.mjs';
import rootRouter from './routes/index.mjs';
import errorHandler from './middleware/error-handler.mjs';
import notFound from './middleware/not-found.mjs';
import responseMetrics from './middleware/response-metrics.mjs';
import requestMetricsContext from './observability/request-metrics.mjs';
import { autoWriteNoStore } from './middleware/cache-control.middleware.mjs';

const app = express();

// Enable Express trust proxy for Vercel/proxies IP forwarding headers
app.set('trust proxy', true);

// Apply global middlewares
app.use(cors(corsOptions));
app.use(autoWriteNoStore);
app.use(requestMetricsContext);
app.use(responseMetrics);

// Raw body parser for Whop webhook HMAC signature verification
app.use('/api/webhooks/whop', express.raw({ type: 'application/json' }));
app.use('/webhooks/whop', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Mount central routing registry at both /api and / to support Vercel serverless function rewrites
app.use('/api', rootRouter);
app.use('/', rootRouter);

// Fallbacks
app.use(notFound);
app.use(errorHandler);

export default app;
export { app };
