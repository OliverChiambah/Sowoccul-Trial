import { db } from '../db/index.js';

// The initial branch set. Admins can add / edit / rename / delete these later.
export const DEFAULT_BRANCHES = [
  { name: 'Bamenda', is_hq: 0 },
  { name: 'Limbe', is_hq: 1 },
  { name: 'Douala', is_hq: 0 },
  { name: 'Bafoussam', is_hq: 0 },
  { name: 'Ebolowa', is_hq: 0 },
  { name: 'Yaounde', is_hq: 0 },
];

/** Ensures the branches table has the default rows the first time only. */
export async function ensureBranchesSeeded() {
  const row = await db.one('SELECT COUNT(*)::int AS n FROM branches');
  if (row && row.n > 0) return;
  for (let i = 0; i < DEFAULT_BRANCHES.length; i += 1) {
    const b = DEFAULT_BRANCHES[i];
    await db.run('INSERT INTO branches (name, is_hq, sort_order) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING', [b.name, b.is_hq, i]);
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
