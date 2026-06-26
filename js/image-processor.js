/**
 * image-processor.js
 *
 * Client-side image processing before upload:
 *   - Resize longest edge to maxDim (default 2000px)
 *   - Convert to WebP (with JPEG fallback)
 *   - Quality ~0.8
 *   - Strip EXIF (Canvas API does not copy EXIF to output)
 *   - Generate thumbnail (default 500px longest edge)
 *
 * Usage:
 *   const { blob, ext } = await processImage(file);
 *   const { blob: thumbBlob, ext: thumbExt } = await generateThumbnail(file);
 */

const IMAGE_MAX_DIM = 2000;
const THUMB_MAX_DIM = 500;
const IMAGE_QUALITY = 0.8;

/**
 * Returns true if the browser can encode WebP via canvas.
 * Cached after first call.
 */
let _webpSupported = null;
function supportsWebP() {
  if (_webpSupported !== null) return _webpSupported;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  _webpSupported = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  return _webpSupported;
}

/**
 * Loads a File/Blob as an HTMLImageElement.
 * @param {File|Blob} file
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

/**
 * Resizes an image to fit within maxDim × maxDim, preserving aspect ratio,
 * then encodes it as WebP (or JPEG) at the given quality.
 *
 * @param {File|Blob} file
 * @param {number} maxDim - Maximum length of the longest edge in pixels
 * @param {number} quality - Encoding quality 0–1
 * @returns {Promise<{blob: Blob, ext: string, mimeType: string}>}
 */
async function resizeAndEncode(file, maxDim, quality) {
  const img = await loadImage(file);

  let { naturalWidth: w, naturalHeight: h } = img;

  if (w > maxDim || h > maxDim) {
    if (w >= h) {
      h = Math.round((h / w) * maxDim);
      w = maxDim;
    } else {
      w = Math.round((w / h) * maxDim);
      h = maxDim;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const mimeType = supportsWebP() ? 'image/webp' : 'image/jpeg';
  const ext = mimeType === 'image/webp' ? 'webp' : 'jpg';

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas toBlob failed'));
          return;
        }
        resolve({ blob, ext, mimeType });
      },
      mimeType,
      quality,
    );
  });
}

/**
 * Process a full-size image for storage.
 * Resizes to IMAGE_MAX_DIM, strips EXIF, converts to WebP/JPEG.
 *
 * @param {File} file - Raw image file from <input type="file">
 * @returns {Promise<{blob: Blob, ext: string, mimeType: string}>}
 */
async function processImage(file) {
  return resizeAndEncode(file, IMAGE_MAX_DIM, IMAGE_QUALITY);
}

/**
 * Generate a thumbnail from an image file.
 * Resizes to THUMB_MAX_DIM, strips EXIF, converts to WebP/JPEG.
 *
 * @param {File} file - Raw image file from <input type="file">
 * @returns {Promise<{blob: Blob, ext: string, mimeType: string}>}
 */
async function generateThumbnail(file) {
  return resizeAndEncode(file, THUMB_MAX_DIM, IMAGE_QUALITY);
}
