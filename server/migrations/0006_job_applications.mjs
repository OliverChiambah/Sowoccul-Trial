/**
 * 0006 — job applications from the public Careers page.
 *
 * Stores applicant personal details, education and previous positions, plus the
 * CV and cover letter as inline base64 PDFs (same simple storage as images).
 * Only the General Manager and IT administrator review these. Mirrors what
 * initSchema() creates, so it's safe on fresh and existing databases alike.
 */
export async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS job_applications (
      id              INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      position        TEXT,
      branch          TEXT,
      full_name       TEXT NOT NULL,
      email           TEXT NOT NULL,
      phone           TEXT,
      dob             TEXT,
      address         TEXT,
      education       TEXT,
      experience      TEXT,
      message         TEXT,
      cv_filename     TEXT,
      cv_data         TEXT,
      cover_filename  TEXT,
      cover_data      TEXT,
      status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewed','shortlisted','rejected')),
      reviewed_by     INTEGER REFERENCES users(id),
      reviewed_by_name TEXT,
      review_note     TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      reviewed_at     TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_jobapps_status ON job_applications(status);
    CREATE INDEX IF NOT EXISTS idx_jobapps_created ON job_applications(created_at DESC);
  `);
}
