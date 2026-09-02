import { BadRequestError } from "@avhomes/core";

/**
 * The content type from the BYTES, never from the declared header.
 *
 * A browser sends whatever `Content-Type` the caller puts on the part, so
 * trusting it means an HTML file stored as `image/png` and served from our own
 * origin. That is a stored XSS with the upload button as its delivery mechanism.
 *
 * The allow-list is short on purpose: these are the formats a property gallery
 * and a blog cover actually use.
 */
export interface SniffedImage {
  contentType: string;
  extension: string;
  width: number;
  height: number;
}

const MAX_BYTES = 12 * 1024 * 1024;

export function sniffImage(buffer: ArrayBuffer): SniffedImage {
  if (buffer.byteLength === 0) {
    throw new BadRequestError("file", [{ path: "file", message: "empty" }]);
  }
  if (buffer.byteLength > MAX_BYTES) {
    throw new BadRequestError("file", [
      { path: "file", message: `larger than ${Math.floor(MAX_BYTES / 1024 / 1024)}MB` },
    ]);
  }

  const bytes = new Uint8Array(buffer);

  if (matches(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { contentType: "image/png", extension: "png", ...pngSize(bytes) };
  }
  if (matches(bytes, [0xff, 0xd8, 0xff])) {
    return { contentType: "image/jpeg", extension: "jpg", ...jpegSize(bytes) };
  }
  if (matches(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return {
      contentType: "image/gif",
      extension: "gif",
      width: readU16LE(bytes, 6),
      height: readU16LE(bytes, 8),
    };
  }
  // RIFF....WEBP
  if (matches(bytes, [0x52, 0x49, 0x46, 0x46]) && matches(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])) {
    return { contentType: "image/webp", extension: "webp", ...webpSize(bytes) };
  }

  throw new BadRequestError("file", [
    { path: "file", message: "not a PNG, JPEG, GIF or WebP image (checked by magic bytes)" },
  ]);
}

function matches(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, i) => bytes[i] === byte);
}

function readU16LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

/** IHDR is always the first chunk, at a fixed offset. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  return { width: readU32BE(bytes, 16), height: readU32BE(bytes, 20) };
}

/**
 * Walks JPEG segments to the first start-of-frame marker.
 *
 * Dimensions are only stored there, and the segments before it vary in length
 * with the EXIF payload, so there is no fixed offset to read.
 */
function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1] ?? 0;
    // SOF0..SOF15, skipping the four that are not frame headers.
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      return { height: readU16BE(bytes, offset + 5), width: readU16BE(bytes, offset + 7) };
    }
    const length = readU16BE(bytes, offset + 2);
    if (length <= 0) break;
    offset += 2 + length;
  }
  // Unknown dimensions are stored as zero rather than refused: the image is a
  // valid JPEG, and a gallery that lays out without an aspect ratio still works.
  return { width: 0, height: 0 };
}

function readU16BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

/** Only the common VP8/VP8L/VP8X shapes. Anything else reports zero. */
function webpSize(bytes: Uint8Array): { width: number; height: number } {
  const format = String.fromCharCode(...bytes.subarray(12, 16));
  if (format === "VP8X") {
    const width = 1 + (readU16LE(bytes, 24) | ((bytes[26] ?? 0) << 16));
    const height = 1 + (readU16LE(bytes, 27) | ((bytes[29] ?? 0) << 16));
    return { width, height };
  }
  if (format === "VP8 ") {
    return { width: readU16LE(bytes, 26) & 0x3fff, height: readU16LE(bytes, 28) & 0x3fff };
  }
  if (format === "VP8L") {
    const bits = readU32BE(bytes, 21);
    void bits;
    const b0 = bytes[21] ?? 0;
    const b1 = bytes[22] ?? 0;
    const b2 = bytes[23] ?? 0;
    const b3 = bytes[24] ?? 0;
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    };
  }
  return { width: 0, height: 0 };
}
