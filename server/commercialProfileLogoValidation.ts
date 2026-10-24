import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

/**
 * Validate and normalize a self-managed commercial logo. The file remains
 * private, never replaces a client's avatar, and contains only verified PNG
 * image chunks (no EXIF, embedded text or arbitrary trailing data).
 */
const MAX_FILE_BYTES = 1_000_000;
const PNG_MAGIC = Buffer.from("89504e470d0a1a0a", "hex");

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let j = 0; j < buf.length; j++) {
    crc ^= buf[j];
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const payload = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(payload));
  return Buffer.concat([length, payload, checksum]);
}

export function validateCommercialLogoPng(input: Buffer): { png: Buffer; sha256: string; width: number; height: number } {
  if (input.length < 60 || input.length > MAX_FILE_BYTES || !input.subarray(0,8).equals(PNG_MAGIC))
    throw new Error("Sube un PNG válido de máximo 1 MB.");

  let offset = 8, width = 0, height = 0;
  let seenHeader = false, seenEnd = false, seenData = false;
  const compressed: Buffer[] = [];
  let compressedBytes = 0;
  while (offset < input.length) {
    if (offset + 12 > input.length) throw new Error("PNG incompleto.");
    const n = input.readUInt32BE(offset);
    if (n > MAX_FILE_BYTES || offset + 12 + n > input.length) throw new Error("Bloque PNG inválido.");
    const type = input.toString("ascii", offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error("Tipo de bloque PNG inválido.");
    const data = input.subarray(offset + 8, offset + 8 + n);
    const claimed = input.readUInt32BE(offset + 8 + n);
    if (claimed !== crc32(input.subarray(offset+4,offset+8+n))) throw new Error("PNG dañado (CRC).");
    offset += 12 + n;
    if (type === "IHDR") {
      if (seenHeader || seenData || n !== 13) throw new Error("Encabezado PNG inválido.");
      seenHeader = true;
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (width < 32 || height < 32 || width > 2048 || height > 2048 ||
          data[8] !== 8 || ![2,6].includes(data[9]) || data[10] !== 0 ||
          data[11] !== 0 || data[12] !== 0)
        throw new Error("El PNG debe ser RGB o RGBA, 8 bits, 32–2048 píxeles por lado.");
    } else if (type === "IDAT") {
      if (!seenHeader || seenEnd) throw new Error("Orden de bloques PNG inválido.");
      seenData = true; compressed.push(data); compressedBytes += n;
    } else if (type === "IEND") {
      if (!seenHeader || !seenData || n !== 0 || offset !== input.length)
        throw new Error("Cierre PNG inválido.");
      seenEnd = true; break;
    } else if (type[0] === type[0].toUpperCase()) {
      // Reject unknown/unsupported critical chunks, including palette/interlace.
      throw new Error("Bloque PNG no compatible.");
    }
    // Safe ancillary chunks are intentionally discarded (private metadata).
  }
  if (!seenEnd || !compressedBytes) throw new Error("PNG incompleto.");

  const channels = input[25] === 6 ? 4 : 3; // IHDR color type byte at offset 25.
  const stride = 1 + width * channels;
  const expected = stride * height;
  let pixels: Buffer;
  try { pixels = inflateSync(Buffer.concat(compressed), { maxOutputLength: expected + 1 }); }
  catch { throw new Error("No se pudo decodificar el PNG."); }
  if (pixels.length !== expected) throw new Error("Datos PNG inconsistentes.");
  for (let y=0; y<height; y++) if (pixels[y*stride] > 4)
    throw new Error("Filtro PNG inválido.");

  // Strip ancillary chunks to keep uploads small and metadata-free.
  const ihdr = input.subarray(16, 29);
  const normalized = Buffer.concat([
    PNG_MAGIC, chunk("IHDR", ihdr), chunk("IDAT", Buffer.concat(compressed)), chunk("IEND", Buffer.alloc(0))
  ]);
  if (normalized.length > MAX_FILE_BYTES) throw new Error("Logo demasiado grande.");
  return {
    png: normalized,
    sha256: createHash("sha256").update(normalized).digest("hex"),
    width, height
  };
}
