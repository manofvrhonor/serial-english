// ===== Нативная распаковка ZIP (deflate-raw / store) =====

const SIG_EOCD = 0x06054b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;

function readU16(view, off) {
  return view.getUint16(off, true);
}

function readU32(view, off) {
  return view.getUint32(off, true);
}

function findEocd(view) {
  const len = view.byteLength;
  const minEocd = 22;
  const maxComment = 0xffff;
  const start = Math.max(0, len - minEocd - maxComment);
  for (let i = len - minEocd; i >= start; i--) {
    if (readU32(view, i) === SIG_EOCD) return i;
  }
  throw new Error("ZIP: не найден конец архива");
}

async function inflateRaw(compressed) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("DecompressionStream недоступен в этом браузере");
  }
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

function decodeUtf8(bytes) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<Array<{ name: string, data: Uint8Array }>>}
 */
export async function unzip(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const eocdOff = findEocd(view);
  const cdOff = readU32(view, eocdOff + 16);
  const totalEntries = readU16(view, eocdOff + 10);

  const files = [];
  let off = cdOff;

  for (let i = 0; i < totalEntries; i++) {
    if (readU32(view, off) !== SIG_CEN) throw new Error("ZIP: повреждён central directory");

    const compression = readU16(view, off + 10);
    const compSize = readU32(view, off + 20);
    const nameLen = readU16(view, off + 28);
    const extraLen = readU16(view, off + 30);
    const commentLen = readU16(view, off + 32);
    const localOff = readU32(view, off + 42);
    const nameBytes = new Uint8Array(view.buffer, view.byteOffset + off + 46, nameLen);
    const name = decodeUtf8(nameBytes).replace(/\\/g, "/");

    off += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue;

    if (readU32(view, localOff) !== SIG_LOC) {
      throw new Error(`ZIP: повреждён файл ${name}`);
    }

    const locNameLen = readU16(view, localOff + 26);
    const locExtraLen = readU16(view, localOff + 28);
    const dataOff = localOff + 30 + locNameLen + locExtraLen;
    const compressed = new Uint8Array(view.buffer, view.byteOffset + dataOff, compSize);

    let raw;
    if (compression === 0) {
      raw = compressed;
    } else if (compression === 8) {
      raw = await inflateRaw(compressed);
    } else {
      throw new Error(`ZIP: метод сжатия ${compression} не поддерживается (${name})`);
    }

    files.push({ name, data: raw });
  }

  return files;
}

/** @param {File} file */
export async function unzipFile(file) {
  return unzip(await file.arrayBuffer());
}

/** @param {{ data: Uint8Array }} entry */
export function entryText(entry) {
  return decodeUtf8(entry.data);
}

/** @param {Array<{ name: string }>} entries */
export function filterSrtEntries(entries) {
  return entries.filter((e) => /\.srt$/i.test(e.name.split("/").pop() || ""));
}
