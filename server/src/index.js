import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initSchema } from './db/index.js';
import { reconcileContentOnce } from './lib/content.js';
import { ensureChart, backfillOpeningBalances } from './lib/ledger.js';
import { drainOutbox } from './lib/notify.js';
import { emailProviderName } from './lib/mailer.js';
import { logger } from './lib/logger.js';
import { requestContext, errorHandler } from './middleware/context.js';
import { authRouter } from './routes/auth.js';
import { accountsRouter } from './routes/accounts.js';
import { loansRouter } from './routes/loans.js';
import { adminRouter } from './routes/admin.js';
import { contentRouter } from './routes/content.js';
import { meRouter } from './routes/me.js';
import { staffRouter } from './routes/staff.js';

const app = express();

// Behind Render's proxy, trust the X-Forwarded-* headers so req.ip is the real
// client IP (used by rate limiting) and https is detected correctly.
app.set('trust proxy', 1);

app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));

// Assigns a request id, attaches req.log, and logs each request's completion.
app.use(requestContext);

// Tell browsers to stick to HTTPS once they've seen us (see docs/RUNBOOK-https).
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
app.use('/api/content', contentRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/loans', loansRouter);
app.use('/api/me', meRouter);
app.use('/api/staff', staffRouter);
app.use('/api/admin', adminRouter);

// Central error handler — must be registered last.
app.use(errorHandler);

const port = process.env.PORT || 4000;

async function start() {
  try {
    await initSchema();
    await ensureChart();   // seed the ledger's base chart of accounts (idempotent)
    // One-time: push the real Board of Directors and Board President into any
    // database that was saved before those details were supplied. Runs once,
    // then never touches the content again (see reconcileContentOnce).
    const rc = await reconcileContentOnce();
    if (rc.ran) logger.info('content.reconciled', { sections: ['board', 'team'] });
    // Bring the ledger in sync with any pre-existing balances (idempotent; only
    // acts on accounts that have no ledger history yet).
    const bf = await backfillOpeningBalances();
    if (bf.posted) logger.info('ledger.backfill', bf);
  } catch (err) {
    logger.error('startup.db_unavailable', { err });
    logger.error('startup.hint', { message: 'Check DATABASE_URL and that Postgres is reachable.' });
    process.exit(1);
  }
  app.listen(port, () => {
    logger.info('server.start', { port });
  });

  // Notification outbox worker: deliver queued emails every 20s. Runs in-process
  // (fine for this scale); if you later run multiple instances, move this to a
  // single worker or a proper queue to avoid double-sending.
  const NOTIFY_INTERVAL_MS = Number(process.env.NOTIFY_INTERVAL_MS || 20000);
  if (NOTIFY_INTERVAL_MS > 0) {
    setInterval(() => { drainOutbox().catch((e) => logger.error('notify.worker_error', { error: e.message })); }, NOTIFY_INTERVAL_MS);
    logger.info('notify.worker_started', { intervalMs: NOTIFY_INTERVAL_MS, provider: emailProviderName() });
  }
}

start();
