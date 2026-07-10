/**
 * Read an image File chosen in an <input type="file"> into a base64 data URL,
 * with client-side guards that mirror the server's rules. The server re-checks
 * everything (type, magic bytes, size) — this just gives instant feedback and
 * avoids uploading something that will only be rejected.
 *
 * Downscales large images to keep the stored data URL small (staff photos are
 * stored inline), targeting a max dimension so a phone photo doesn't become a
 * multi-megabyte string.
 */

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_DIM = 512;          // px — plenty for a headshot
const MAX_BYTES = 1_000_000;  // ~1 MB after downscale

export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file selected.'));
    if (!ALLOWED.includes(file.type)) {
      return reject(new Error('Please choose a JPEG, PNG, or WebP image.'));
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a valid image.'));
      img.onload = () => {
        // Downscale to MAX_DIM on the longest side, preserving aspect ratio.
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          const scale = MAX_DIM / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        // Re-encode as JPEG for consistent, small output (keeps PNGs from bloating).
        const out = canvas.toDataURL('image/jpeg', 0.85);
        if (out.length > MAX_BYTES * 1.4) {
          return reject(new Error('Image is too large even after resizing. Try a smaller photo.'));
        }
        resolve(out);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
