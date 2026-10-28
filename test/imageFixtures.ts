import { deflateSync } from "node:zlib";

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    let c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** A plain RGB gradient PNG, made by hand so no image file is needed. */
export function makePng(width: number, height: number): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * (width * 3 + 1) + 1 + x * 3;
      raw[at] = x % 256;
      raw[at + 1] = y % 256;
      raw[at + 2] = 128;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** A PNG whose header claims `width` x `height` and whose pixel data is empty: small on the wire, huge if it were decoded. */
export function makeHugePng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.alloc(0))),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** The latitude written into the fake EXIF: 12 deg 58 min 12 sec, a place a person could be found at. */
export const GPS_MARKER = [12, 58, 12];

/**
 * An EXIF APP1 segment with an orientation and a GPS latitude. Little endian TIFF: IFD0 holds Orientation and a pointer to the GPS
 * IFD, which holds GPSLatitudeRef and GPSLatitude (three rationals).
 */
export function exifSegment(orientation = 1): Buffer {
  const tiff = Buffer.alloc(8 + 2 + 2 * 12 + 4 + 2 + 2 * 12 + 4 + 24);
  tiff.write("II", 0, "ascii");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  // IFD0 at 8: two entries.
  tiff.writeUInt16LE(2, 8);
  // Orientation (0x0112), SHORT, 1 value.
  tiff.writeUInt16LE(0x0112, 10);
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(orientation, 18);
  // GPSInfo pointer (0x8825), LONG, to offset 38.
  tiff.writeUInt16LE(0x8825, 22);
  tiff.writeUInt16LE(4, 24);
  tiff.writeUInt32LE(1, 26);
  tiff.writeUInt32LE(38, 30);
  tiff.writeUInt32LE(0, 34);
  // GPS IFD at 38: two entries.
  tiff.writeUInt16LE(2, 38);
  // GPSLatitudeRef (0x0001), ASCII, 2 bytes, inline "N\0".
  tiff.writeUInt16LE(0x0001, 40);
  tiff.writeUInt16LE(2, 42);
  tiff.writeUInt32LE(2, 44);
  tiff.write("N", 48, "ascii");
  // GPSLatitude (0x0002), RATIONAL, 3 values, at offset 66.
  tiff.writeUInt16LE(0x0002, 52);
  tiff.writeUInt16LE(5, 54);
  tiff.writeUInt32LE(3, 56);
  tiff.writeUInt32LE(66, 60);
  tiff.writeUInt32LE(0, 64);
  GPS_MARKER.forEach((value, index) => {
    tiff.writeUInt32LE(value, 66 + index * 8);
    tiff.writeUInt32LE(1, 70 + index * 8);
  });
  const body = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff.subarray(0, 66 + 24)]);
  const segment = Buffer.alloc(4);
  segment[0] = 0xff;
  segment[1] = 0xe1;
  segment.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([segment, body]);
}

/** The same JPEG with an EXIF segment spliced in right after the start marker. */
export function withExif(jpeg: Uint8Array, orientation = 1): Buffer {
  return Buffer.concat([jpeg.subarray(0, 2), exifSegment(orientation), jpeg.subarray(2)]);
}

/** The marker ids of the segments before the picture data starts, to show what metadata a JPEG carries. */
export function jpegMarkers(jpeg: Uint8Array): number[] {
  const markers: number[] = [];
  let at = 2;
  while (at + 4 <= jpeg.length && jpeg[at] === 0xff) {
    const marker = jpeg[at + 1] as number;
    if (marker === 0xda) break;
    markers.push(marker);
    at += 2 + (((jpeg[at + 2] as number) << 8) | (jpeg[at + 3] as number));
  }
  return markers;
}

export const containsBytes = (haystack: Uint8Array, needle: Uint8Array): boolean => Buffer.from(haystack).includes(Buffer.from(needle));
