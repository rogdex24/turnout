/** The long side of the uploaded photo, in pixels. The server re-encodes to the same size, so a bigger file is only wasted data. */
export const PHOTO_MAX_SIDE = 1080;
/** JPEG quality for the on-device resize (expo-image-manipulator takes 0 to 1). */
export const PHOTO_JPEG_QUALITY = 0.8;

export interface Size {
  width: number;
  height: number;
}

/** The size to resize to: the long side becomes 1080, the ratio stays, and a smaller photo is left as it is. */
export function photoResizeTarget(width: number, height: number): Size {
  const long = Math.max(width, height);
  if (long <= PHOTO_MAX_SIDE) return { width, height };
  const scale = PHOTO_MAX_SIDE / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function uploadProgress(sent: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, sent / total));
}
