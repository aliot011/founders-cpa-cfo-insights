import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import { env } from './env.ts';
import { errorMiddleware } from './errors.ts';
import { authRouter } from './routes/auth.ts';
import { clientsRouter } from './routes/clients.ts';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/api/clients', clientsRouter);

if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
  app.use(express.static(dist));
  // SPA fallback for any non-API route.
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorMiddleware);

app.listen(env.PORT, () => {
  console.log(`API server listening on http://localhost:${env.PORT} (${env.QBO_ENVIRONMENT})`);
});
