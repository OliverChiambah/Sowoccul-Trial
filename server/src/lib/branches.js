import { db } from '../db/index.js';

// The initial branch set. Admins can add / edit / rename / delete these later.
export const DEFAULT_BRANCHES = [
  { name: 'Bamenda', is_hq: 0, manager_name: 'Awah Genevieve', phone: '693 37 18 28', email: 'mahbih@gmail.com' },
  { name: 'Limbe', is_hq: 1, manager_name: 'Zipoh Ophilia', phone: '656 92 32 46', email: 'zipohophil@gmail.com' },
  { name: 'Douala', is_hq: 0, manager_name: 'Etone Samuel', phone: '677 96 00 72', email: 'siretone2002@yahoo.com' },
  { name: 'Bafoussam', is_hq: 0, manager_name: 'Mbah Victoria', phone: '677 83 08 94', email: 'Victoriambah931@gmail.com' },
  { name: 'Garoua', is_hq: 0, manager_name: 'Elate Roland', phone: '676 78 53 22', email: 'rolandelate@gmail.com' },
  { name: 'Yaounde', is_hq: 0, manager_name: 'Enow Franklin', phone: '675 93 88 24', email: 'enow2frank@yahoo.com' },
];

/** Ensures the branches table has the default rows the first time only. */
export async function ensureBranchesSeeded() {
  const row = await db.one('SELECT COUNT(*)::int AS n FROM branches');
  if (row && row.n > 0) {
    // Table already populated (e.g. an older database seeded before the branch
    // managers were known). Backfill the contact fields ONLY where they are
    // still empty, so we never overwrite anything an admin has since edited.
    await backfillBranchContacts();
    return;
  }
  for (let i = 0; i < DEFAULT_BRANCHES.length; i += 1) {
    const b = DEFAULT_BRANCHES[i];
    await db.run(
      'INSERT INTO branches (name, is_hq, sort_order, manager_name, phone, email) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (name) DO NOTHING',
      [b.name, b.is_hq, i, b.manager_name || null, b.phone || null, b.email || null]
    );
  }
}

/**
 * Fill in manager_name/phone/email for existing branch rows that are still
 * blank. Uses COALESCE so a value the admin already set is left untouched. Safe
 * to run on every boot; it only writes into empty fields.
 */
async function backfillBranchContacts() {
  for (const b of DEFAULT_BRANCHES) {
    if (!b.manager_name && !b.phone && !b.email) continue;
    await db.run(
      `UPDATE branches
          SET manager_name = COALESCE(NULLIF(manager_name, ''), $2),
              phone        = COALESCE(NULLIF(phone, ''), $3),
              email        = COALESCE(NULLIF(email, ''), $4)
        WHERE name = $1
          AND (manager_name IS NULL OR manager_name = ''
            OR phone IS NULL OR phone = ''
            OR email IS NULL OR email = '')`,
      [b.name, b.manager_name || null, b.phone || null, b.email || null]
    );
  }
}

/** All branches, ordered. */
export async function listBranches() {
  await ensureBranchesSeeded();
  return db.all('SELECT id, name, is_hq, address, phone, email, manager_name, office_photo, description, sort_order FROM branches ORDER BY sort_order, name');
}

/** Just the branch names (used for validation and dropdowns). */
export async function branchNames() {
  const list = await listBranches();
  return list.map((b) => b.name);
}

/** The HQ branch name, or the first branch if none flagged. */
export async function headquarters() {
  const list = await listBranches();
  const hq = list.find((b) => b.is_hq);
  return (hq || list[0])?.name || 'Limbe';
}

/**
 * One branch (by id or name) with the staff assigned to it. Staff are the
 * real user accounts with role 'staff' or 'admin' whose branch matches, so
 * the public branch page always reflects who actually works there.
 */
export async function branchWithStaff(idOrName) {
  await ensureBranchesSeeded();
  const byId = /^\d+$/.test(String(idOrName));
  const branch = byId
    ? await db.one('SELECT * FROM branches WHERE id = $1', [Number(idOrName)])
    : await db.one('SELECT * FROM branches WHERE name = $1', [String(idOrName)]);
  if (!branch) return null;
  const staff = await db.all(
    "SELECT full_name, email, phone, role FROM users WHERE branch = $1 AND role IN ('staff','admin') ORDER BY role DESC, full_name",
    [branch.name]
  );
  return { branch, staff };
}
