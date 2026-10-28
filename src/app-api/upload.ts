import { AppError } from "./errors.js";

export type ImageKind = "jpeg" | "png" | "heic";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);

/** What the bytes are, by their first bytes. The file name and the content type the caller sent are never trusted. */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return "png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp" &&
    HEIC_BRANDS.has(String.fromCharCode(...bytes.subarray(8, 12)))
  )
    return "heic";
  return null;
}

export const PHOTO_MAX_SIDE = 1080;
const PHOTO_QUALITY = 85;
/** A ticket screenshot keeps more detail than a face, so the operator can read the small print. */
export const TICKET_MAX_SIDE = 2000;
const TICKET_QUALITY = 85;

/**
 * Decodes the upload and writes a new JPEG, longest side at most `maxSide` px. Only pixels come across: EXIF (including a GPS
 * position) and every other piece of metadata is dropped, because the file is made again from the decoded picture. Anything the
 * decoder cannot read is `unsupported_type`; one with more than `maxPixels` pixels is `file_too_large`.
 */
async function reencodeJpeg(bytes: Uint8Array, maxPixels: number, maxSide: number, quality: number): Promise<Uint8Array> {
  try {
    const source = new Bun.Image(bytes);
    const { width, height } = await source.metadata();
    // The header is read before any pixel is decoded, so a small file that claims a huge picture costs nothing.
    if (width * height > maxPixels) throw new AppError(413, "file_too_large", "that picture is too large, send one under 40 megapixels");
    const scaled = Math.max(width, height) > maxSide ? source.resize(maxSide, maxSide, { fit: "inside" }) : source;
    return await scaled.jpeg({ quality }).bytes();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, "unsupported_type", "that picture could not be read, try a JPEG or PNG");
  }
}

/** A profile photo: a new JPEG, longest side at most 1080 px, no metadata. */
export const reencodePhoto = (bytes: Uint8Array, maxPixels: number): Promise<Uint8Array> =>
  reencodeJpeg(bytes, maxPixels, PHOTO_MAX_SIDE, PHOTO_QUALITY);

/** A ticket screenshot: a new JPEG, longest side at most 2000 px, no metadata. */
export const reencodeTicketImage = (bytes: Uint8Array, maxPixels: number): Promise<Uint8Array> =>
  reencodeJpeg(bytes, maxPixels, TICKET_MAX_SIDE, TICKET_QUALITY);
