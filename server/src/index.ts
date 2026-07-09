import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import { env } from './env.ts';
import { errorMiddleware } from './errors.ts';
import { attachUser, baseUrl, newRawToken, requireAuth, requireRole, sha256 } from './auth.ts';
import { anyUserHasPassword, createAuthToken, createUser, listUsers } from './db.ts';
import { authRouter } from './routes/auth.ts';
import { clientsRouter } from './routes/clients.ts';
import { sessionRouter } from './routes/session.ts';
import { usersRouter } from './routes/users.ts';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(attachUser);

app.use('/api/session', sessionRouter);
// Connecting/authorizing QBO companies is practice administration.
app.use('/api/auth', requireRole('admin'), authRouter);
app.use('/api/clients', requireAuth, clientsRouter);
app.use('/api/users', requireRole('admin'), usersRouter);

if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
  app.use(express.static(dist));
  // SPA fallback for any non-API route.
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorMiddleware);

app.listen(env.PORT, () => {
  console.log(`API server listening on http://localhost:${env.PORT} (${env.QBO_ENVIRONMENT})`);

  // Bootstrap: until any user has a password, print a set-password link for
  // the first admin so sign-in can be established without a mailer.
  if (!anyUserHasPassword()) {
    let admin = listUsers().find((u) => u.role === 'admin');
    // Brand-new database: seed the first admin from the environment.
    const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
    if (!admin && listUsers().length === 0 && bootstrapEmail) {
      admin = createUser({ email: bootstrapEmail.toLowerCase(), name: 'Admin', role: 'admin', realmIds: [] });
      console.log(`Seeded first admin ${bootstrapEmail} (rename them on the Users page).`);
    }
    if (admin) {
      const raw = newRawToken();
      createAuthToken(admin.id, 'invite', sha256(raw), 7 * 24 * 60 * 60 * 1000);
      console.log(`\nNo user has a password yet. Set one for ${admin.email} here:`);
      console.log(`${baseUrl()}/set-password?token=${raw}\n`);
    } else {
      console.log('No admin user exists yet; add one via the API before enabling sign-in.');
    }
  }
});
