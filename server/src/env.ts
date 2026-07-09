import 'dotenv/config';

export interface Env {
  QBO_CLIENT_ID: string;
  QBO_CLIENT_SECRET: string;
  QBO_REDIRECT_URI: string;
  QBO_ENVIRONMENT: 'sandbox' | 'production';
  PORT: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

export const env: Env = {
  QBO_CLIENT_ID: required('QBO_CLIENT_ID'),
  QBO_CLIENT_SECRET: required('QBO_CLIENT_SECRET'),
  // On Render, RENDER_EXTERNAL_URL is the service's https URL; register
  // <url>/api/auth/callback as a redirect URI on the Intuit app.
  QBO_REDIRECT_URI:
    process.env.QBO_REDIRECT_URI ??
    (process.env.RENDER_EXTERNAL_URL
      ? `${process.env.RENDER_EXTERNAL_URL}/api/auth/callback`
      : required('QBO_REDIRECT_URI')),
  QBO_ENVIRONMENT: (() => {
    const v = process.env.QBO_ENVIRONMENT ?? 'sandbox';
    if (v !== 'sandbox' && v !== 'production') {
      throw new Error(`QBO_ENVIRONMENT must be "sandbox" or "production", got "${v}"`);
    }
    return v;
  })(),
  PORT: Number(process.env.PORT ?? 3001),
};
