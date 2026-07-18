/**
 * Read a PDF File chosen in an <input type="file"> into a base64 data URL, with
 * client-side guards that mirror the server (type + size). The server re-checks
 * everything; this just gives instant feedback. Returns { dataUrl, filename }.
 */

const MAX_BYTES = 2_000_000; // ~2 MB, matches the server cap

export function readPdfFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file selected.'));
    if (file.type !== 'application/pdf') {
      return reject(new Error('Please choose a PDF file.'));
    }
    if (file.size > MAX_BYTES) {
      return reject(new Error('That PDF is too large. Please use one under about 2 MB.'));
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => resolve({ dataUrl: String(reader.result), filename: file.name });
    reader.readAsDataURL(file);
  });
}
