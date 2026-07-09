import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import { env } from './env.ts';
import { errorMiddleware } from './errors.ts';
import { authRouter } from './routes/auth.ts';
import { clientsRouter } from './routes/clients.ts';
import { usersRouter } from './routes/users.ts';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Interim gate until real sign-in exists: when BASIC_AUTH_PASSWORD is set,
// everything (app, API, OAuth callback) requires it. Any username works.
const basicAuthPassword = process.env.BASIC_AUTH_PASSWORD;
if (basicAuthPassword) {
  app.use((req, res, next) => {
    const [scheme, encoded] = (req.headers.authorization ?? '').split(' ');
    if (scheme === 'Basic' && encoded) {
      const password = Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':');
      if (password === basicAuthPassword) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Advisory Intelligence"');
    res.status(401).send('Authentication required');
  });
}

app.use('/api/auth', authRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/users', usersRouter);

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
