/**
 * 0007 — separate the Head Office from the Limbe branch, and fix branch order.
 *
 * Previously Limbe was flagged as the headquarters (is_hq = 1), so the two were
 * one row. The cooperative treats the Head Office as a distinct office, giving
 * seven in total. This migration:
 *
 *   1. inserts 'Head Office' as the headquarters (if not already present),
 *   2. demotes Limbe to an ordinary branch,
 *   3. sets sort_order to the cooperative's order of creation and importance:
 *      Head Office, Limbe, Douala, Bamenda, Yaounde, Garoua, Bafoussam.
 *
 * Member and staff records that reference 'Limbe' are untouched — Limbe still
 * exists as a branch, so no data is orphaned.
 */
const ORDER = [
  ['Head Office', 1],
  ['Limbe', 0],
  ['Douala', 0],
  ['Bamenda', 0],
  ['Yaounde', 0],
  ['Garoua', 0],
  ['Bafoussam', 0],
];

export async function up(client) {
  // 1 & 2 — make sure Head Office exists and is the only HQ.
  await client.query(
    `INSERT INTO branches (name, is_hq, sort_order, manager_name, phone, email)
     VALUES ('Head Office', 1, 0, 'Kemonde David', '677 65 22 18', 'd.kemonde@gmail.com')
     ON CONFLICT (name) DO NOTHING`
  );
  await client.query(`UPDATE branches SET is_hq = 0 WHERE name <> 'Head Office'`);
  await client.query(`UPDATE branches SET is_hq = 1 WHERE name = 'Head Office'`);

  // 3 — apply the institutional order. Anything not listed sorts after.
  for (let i = 0; i < ORDER.length; i += 1) {
    const [name] = ORDER[i];
    await client.query('UPDATE branches SET sort_order = $1 WHERE name = $2', [i, name]);
  }
  await client.query(
    `UPDATE branches SET sort_order = 99 WHERE name <> ALL($1::text[])`,
    [ORDER.map((o) => o[0])]
  );
}
