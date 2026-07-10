/**
 * 0002 — staff profile fields.
 *
 * Adds columns for the internal staff directory: an inline profile photo
 * (base64 data URL, validated on upload), a short bio, start date, work phone
 * extension, and languages spoken. All nullable so existing rows are unaffected.
 */
export async function up(client) {
  await client.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_photo    TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS bio            TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS start_date     TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS work_extension TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS languages      TEXT;
  `);
}
