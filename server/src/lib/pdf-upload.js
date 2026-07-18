/**
 * PDF upload validation.
 * ────────────────────────────────────────────────────────────────────────────
 * The same defence-in-depth approach as image.js: an uploaded file is untrusted,
 * and the data-URL prefix the client sets can lie. So we (1) require the claimed
 * type to be application/pdf, and (2) decode the first bytes and confirm the real
 * PDF signature ("%PDF-"). We also cap the size — CVs and cover letters are
 * stored inline as base64, so keeping them modest matters for the database.
 *
 * Returns { ok, mime, dataUrl } on success or { ok:false, error } on failure.
 */

// ~2.8 MB of base64 ≈ ~2 MB PDF. Enough for a CV or cover letter; kept modest
// because the file is stored inline in the database.
const MAX_DATAURL_CHARS = 2_800_000;

/** A PDF begins with the ASCII bytes "%PDF-" (25 50 44 46 2D). */
function looksLikePdf(bytes) {
  const sig = [0x25, 0x50, 0x44, 0x46, 0x2d];
  return bytes.length >= 5 && sig.every((b, i) => bytes[i] === b);
}

export function validatePdfDataUrl(dataUrl, { maxChars = MAX_DATAURL_CHARS } = {}) {
  if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
    return { ok: false, error: 'Provide a PDF file.' };
  }
  if (dataUrl.length > maxChars) {
    return { ok: false, error: 'File is too large. Please use a PDF under about 2 MB.' };
  }
  const m = dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) {
    return { ok: false, error: 'File must be a base64 PDF data URL.' };
  }
  const mime = m[1].toLowerCase();
  if (mime !== 'application/pdf') {
    return { ok: false, error: 'Only PDF files are allowed.' };
  }

  // Decode just the header to verify the real signature.
  let header;
  try {
    header = Buffer.from(m[2].slice(0, 16), 'base64');
  } catch {
    return { ok: false, error: 'The file data could not be read.' };
  }
  if (!looksLikePdf(header)) {
    return { ok: false, error: 'That file does not look like a real PDF. Please upload a valid PDF.' };
  }

  return { ok: true, mime, dataUrl };
}
