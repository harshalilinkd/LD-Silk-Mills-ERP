/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  How big is this picture, without decoding it
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Excel places an embedded image at whatever width and height it is told, and
 * it does not work them out for itself. Told nothing, the Receipts sheet has
 * to guess — and a fixed box turns every portrait phone photo of a bill into a
 * squashed one, which on a page of receipts is the difference between reading
 * an amount and not.
 *
 * So the dimensions are read out of the file's own header. That is a few dozen
 * bytes for each of the three formats a browser produces, and it needs NO
 * image library: there is no rasteriser on a serverless function and adding
 * one to find two integers would be the wrong trade.
 *
 * Anything not recognised returns null and the caller falls back to its box,
 * which is the honest outcome for a format we cannot measure.
 */

export type Size = { width: number; height: number };

/**
 * PNG, JPEG and GIF only — the three a phone camera, a scanner or a screenshot
 * actually produce. WebP and HEIC are deliberately absent: Excel will not
 * render either, so a size for them would be a number with nothing to draw.
 */
export function imageSize(buf: Buffer): Size | null {
  return png(buf) ?? gif(buf) ?? jpeg(buf);
}

/** The extension ExcelJS wants, from the mime type or the file name. */
export function excelImageKind(
  mime: string | null,
  name: string,
): "png" | "jpeg" | "gif" | null {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpeg";
  if (m.includes("gif")) return "gif";
  // A mime type that says nothing useful — `application/octet-stream` is what
  // an older upload recorded — so fall back to the name the uploader gave it.
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "png") return "png";
  if (ext === "jpg" || ext === "jpeg") return "jpeg";
  if (ext === "gif") return "gif";
  return null;
}

/** IHDR is always the first chunk, so width and height sit at a fixed offset. */
function png(b: Buffer): Size | null {
  if (b.length < 24) return null;
  if (b.readUInt32BE(0) !== 0x89504e47 || b.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function gif(b: Buffer): Size | null {
  if (b.length < 10) return null;
  if (b.toString("ascii", 0, 3) !== "GIF") return null;
  // The logical screen descriptor, little-endian — the one format here that is.
  return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
}

/**
 * JPEG keeps its dimensions in a start-of-frame marker, and WHICH marker
 * depends on the encoding (baseline, progressive, arithmetic). So the segments
 * are walked until one of them is a frame header.
 *
 * The three excluded from that family are DHT, JPG and DAC — 0xC4, 0xC8, 0xCC
 * — which share the 0xC0 range and are not frames. Treating one of those as a
 * frame reads a Huffman table as a picture size.
 */
function jpeg(b: Buffer): Size | null {
  if (b.length < 4 || b.readUInt16BE(0) !== 0xffd8) return null;
  let p = 2;
  while (p + 9 < b.length) {
    if (b[p] !== 0xff) {
      // Padding between segments is legal and is written as repeated 0xFF.
      p++;
      continue;
    }
    const marker = b[p + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      p += 2;
      continue;
    }
    // Start of scan: the entropy-coded data begins and there is no frame
    // header after it. Give up rather than walk megabytes of pixels.
    if (marker === 0xda) return null;
    const len = b.readUInt16BE(p + 2);
    if (len < 2) return null;
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      return { height: b.readUInt16BE(p + 5), width: b.readUInt16BE(p + 7) };
    }
    p += 2 + len;
  }
  return null;
}

/**
 * Fit a picture inside a box without distorting it, and never blow a small one
 * up — a 90-pixel thumbnail stretched to fill a 260-pixel cell is a blurred
 * receipt, and the original was perfectly readable.
 */
export function fitBox(size: Size | null, box: Size): Size {
  if (!size || size.width <= 0 || size.height <= 0) return box;
  const scale = Math.min(box.width / size.width, box.height / size.height, 1);
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}
