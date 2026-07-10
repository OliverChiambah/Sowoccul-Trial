/**
 * Image upload validation.
 * ────────────────────────────────────────────────────────────────────────────
 * An uploaded image is untrusted binary. The data-URL prefix (e.g.
 * "data:image/png;base64,") is set by the client and can lie — someone can label
 * a script or an SVG-with-JavaScript as image/png. So we do two things:
 *
 *   1. Allowlist the claimed type (jpeg/png/webp only — no SVG, which can carry
 *      scripts; no gif; nothing exotic).
 *   2. Decode the first bytes and check the real file signature ("magic bytes")
 *      matches the claimed type. If the bytes say it isn't really a JPEG/PNG/WebP,
 *      we reject it regardless of the label.
 *
 * We also cap the size. Photos are stored inline as data URLs (a deliberate,
 * documented simplicity choice for a small team), so keeping them small matters
 * for database and backup size.
 *
 * Returns { ok, mime, dataUrl } on success or { ok:false, error } on failure.
 */

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Roughly 1.4 MB of base64 ≈ ~1 MB of image. Generous for a headshot.
const MAX_DATAURL_CHARS = 1_400_000;

/** Check the decoded header bytes against known signatures for the mime. */
function magicBytesMatch(mime, bytes) {
  // bytes is a Buffer of at least the first ~16 decoded bytes.
  if (mime === 'image/jpeg') {
    // JPEG starts FF D8 FF
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mime === 'image/png') {
    // PNG starts 89 50 4E 47 0D 0A 1A 0A
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= 8 && sig.every((b, i) => bytes[i] === b);
  }
  if (mime === 'image/webp') {
    // WebP: "RIFF" .... "WEBP"
    return bytes.length >= 12 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

export function validateImageDataUrl(dataUrl, { maxChars = MAX_DATAURL_CHARS } = {}) {
  if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
    return { ok: false, error: 'Provide an image.' };
  }
  if (dataUrl.length > maxChars) {
    return { ok: false, error: 'Image is too large. Please use an image under about 1 MB.' };
  }
  const m = dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) {
    return { ok: false, error: 'Image must be a base64 data URL (jpeg, png, or webp).' };
  }
  const mime = m[1].toLowerCase();
  if (!ALLOWED.has(mime)) {
    return { ok: false, error: 'Only JPEG, PNG, or WebP images are allowed.' };
  }

  // Decode just the header to verify the real signature (don't decode megabytes).
  let header;
  try {
    header = Buffer.from(m[2].slice(0, 32), 'base64');
  } catch {
    return { ok: false, error: 'The image data could not be read.' };
  }
  if (!magicBytesMatch(mime, header)) {
    return { ok: false, error: 'That file does not look like a real image. Please upload a valid photo.' };
  }

  return { ok: true, mime, dataUrl };
}
