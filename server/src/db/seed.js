import bcrypt from 'bcryptjs';
import { db, initSchema, closePool } from './index.js';

/**
 * Initialises the database for a fresh deployment.
 *
 * This does NOT create any demo members, accounts, transactions or loans.
 * It only makes sure the tables exist and that there is ONE administrator
 * account you can sign in with to set everything else up.
 *
 * The admin credentials come from environment variables so nothing sensitive
 * is committed to source control:
 *
 *   ADMIN_USERNAME   (default: "admin")
 *   ADMIN_PASSWORD   (required — set your own; see the warning below)
 *   ADMIN_FULL_NAME  (default: "System Administrator")
 *   ADMIN_EMAIL      (default: "admin@example.com")
 *   ADMIN_BRANCH     (default: "Limbe")
 *
 * Run once with:  npm run seed
 * Running it again will NOT duplicate or overwrite the admin.
 */
async function seed() {
  await initSchema();

  const username = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const fullName = process.env.ADMIN_FULL_NAME || 'System Administrator';
  const email = (process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase();
  const branch = process.env.ADMIN_BRANCH || 'Limbe';

  const existing = await db.one('SELECT id FROM users WHERE role = $1 LIMIT 1', ['admin']);
  if (existing) {
    console.log('An administrator account already exists — nothing to do.');
    return;
  }

  // Require a real password. Refuse to create an admin with a weak/blank one.
  if (!password || password.length < 8) {
    console.error(
      '\n[seed] No admin created.\n' +
      'Set a strong ADMIN_PASSWORD (min 8 characters) before seeding, e.g.:\n\n' +
      '  ADMIN_USERNAME=admin ADMIN_PASSWORD="choose-a-strong-password" npm run seed\n'
    );
    process.exitCode = 1;
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  await db.run(`
    INSERT INTO users (username, password_hash, full_name, email, phone, role, review_status, applicant_type, branch, profile)
    VALUES ($1, $2, $3, $4, NULL, 'admin', 'active', 'individual', $5, NULL)
  `, [username, passwordHash, fullName, email, branch]);

  console.log(`Administrator "${username}" created. You can now sign in and set up your branches, staff and members.`);
}

seed()
  .catch((e) => { console.error('[seed] Failed:', e.message); process.exitCode = 1; })
  .finally(async () => { await closePool(); });
