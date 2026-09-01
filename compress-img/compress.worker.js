/**
 * 图片压缩 Web Worker（高保真有损，接近 TinyPNG 体积）
 * 依赖通过 CDN ESM 引入：@jsquash/* / libimagequant-wasm
 */

const CDN = {
  jpegEncode: "https://esm.sh/@jsquash/jpeg@1.6.0/encode",
  jpegDecode: "https://esm.sh/@jsquash/jpeg@1.6.0/decode",
  webpEncode: "https://esm.sh/@jsquash/webp@1.5.0/encode",
  webpDecode: "https://esm.sh/@jsquash/webp@1.5.0/decode",
  oxipng: "https://esm.sh/@jsquash/oxipng@2.3.0/optimise",
  imagequant:
    "https://esm.sh/libimagequant-wasm@0.3.0/wasm/libimagequant_wasm.js",
};

const OXIPNG_LEVEL = 3;
const JPEG_QUALITY_FLOOR = 55;

function pickWebpQuality(byteLength) {
  if (byteLength >= 8 * 1024 * 1024) return 72;
  if (byteLength >= 3 * 1024 * 1024) return 75;
  if (byteLength >= 1 * 1024 * 1024) return 78;
  return 82;
}

function pickJpegQuality(byteLength) {
  if (byteLength >= 8 * 1024 * 1024) return 65;
  if (byteLength >= 3 * 1024 * 1024) return 68;
  if (byteLength >= 1 * 1024 * 1024) return 70;
  return 75;
}

function targetSizeRatio(byteLength) {
  if (byteLength >= 2 * 1024 * 1024) return 0.27;
  if (byteLength >= 1 * 1024 * 1024) return 0.3;
  return 0.4;
}

function detectMime(buffer, fallback = "application/octet-stream") {
  const u8 = new Uint8Array(buffer);
  if (u8.length >= 8) {
    if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) {
      return "image/png";
    }
    if (u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) {
      return "image/jpeg";
    }
    if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) {
      return "image/gif";
    }
    if (u8[0] === 0x42 && u8[1] === 0x4d) {
      return "image/bmp";
    }
    if (
      u8[0] === 0x52 &&
      u8[1] === 0x49 &&
      u8[2] === 0x46 &&
      u8[3] === 0x46 &&
      u8[8] === 0x57 &&
      u8[9] === 0x45 &&
      u8[10] === 0x42 &&
      u8[11] === 0x50
    ) {
      return "image/webp";
    }
  }
  return fallback;
}

function concatChunks(chunks) {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out.buffer;
}

function stripJpegMetadata(buffer) {
  const src = new Uint8Array(buffer);
  if (src.length < 4 || src[0] !== 0xff || src[1] !== 0xd8) {
    return buffer;
  }

  const chunks = [new Uint8Array([0xff, 0xd8])];
  let i = 2;

  while (i < src.length) {
    if (src[i] !== 0xff) {
      chunks.push(src.subarray(i));
      break;
    }

    let marker = src[i + 1];
    while (marker === 0xff && i + 1 < src.length) {
      i += 1;
      marker = src[i + 1];
    }
    if (i + 1 >= src.length) break;

    if (marker === 0xda) {
      chunks.push(src.subarray(i));
      break;
    }

    if (marker === 0xd9) {
      chunks.push(new Uint8Array([0xff, marker]));
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      chunks.push(new Uint8Array([0xff, marker]));
      i += 2;
      continue;
    }

    if (i + 3 >= src.length) break;
    const len = (src[i + 2] << 8) | src[i + 3];
    if (len < 2 || i + 2 + len > src.length) {
      chunks.push(src.subarray(i));
      break;
    }

    const isApp = marker >= 0xe1 && marker <= 0xef;
    const isCom = marker === 0xfe;
    if (!isApp && !isCom) {
      chunks.push(src.subarray(i, i + 2 + len));
    }
    i += 2 + len;
  }

  return concatChunks(chunks);
}

async function bufferToImageData(buffer, mimeType) {
  const blob = new Blob([buffer], {
    type: mimeType || "application/octet-stream",
  });
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

function hasAlpha(imageData) {
  const { data } = imageData;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

function pickSmaller(original, candidates) {
  let best = original;
  let bestSize = original.byteLength;
  let bestMeta = null;
  for (const item of candidates) {
    if (
      item?.buffer &&
      item.buffer.byteLength > 0 &&
      item.buffer.byteLength < bestSize
    ) {
      best = item.buffer;
      bestSize = item.buffer.byteLength;
      bestMeta = item;
    }
  }
  return { buffer: best, size: bestSize, meta: bestMeta };
}

async function encodeWebpLossy(imageData, quality) {
  const { default: encode } = await import(CDN.webpEncode);
  return encode(imageData, {
    quality,
    method: 4,
    lossless: 0,
    exact: 0,
  });
}

async function encodePngOxipng(source) {
  const { default: optimise } = await import(CDN.oxipng);
  return optimise(source, {
    level: OXIPNG_LEVEL,
    interlace: false,
    optimiseAlpha: true,
  });
}

let imagequantReady = null;

async function ensureImagequant() {
  if (!imagequantReady) {
    imagequantReady = import(CDN.imagequant).then(async (mod) => {
      await mod.default();
      return mod;
    });
  }
  return imagequantReady;
}

function u8ToArrayBuffer(u8) {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

function pickPngColorSteps(byteLength) {
  if (byteLength >= 6 * 1024 * 1024) return [144, 112, 80, 64];
  if (byteLength >= 3 * 1024 * 1024) return [192, 144, 96, 72];
  if (byteLength >= 1 * 1024 * 1024) return [256, 192, 128];
  return [256, 192];
}

function pickPngQuantQuality(byteLength) {
  if (byteLength >= 6 * 1024 * 1024) return { min: 10, target: 72 };
  if (byteLength >= 3 * 1024 * 1024) return { min: 15, target: 78 };
  return { min: 20, target: 85 };
}

async function encodePngLossy(imageData, originalByteLength) {
  const mod = await ensureImagequant();
  const { ImageQuantizer, encode_palette_to_png } = mod;
  const targetBytes = Math.floor(
    originalByteLength * targetSizeRatio(originalByteLength),
  );
  const colorSteps = pickPngColorSteps(originalByteLength);
  let bestBuf = null;

  for (const maxColors of colorSteps) {
    const quantizer = new ImageQuantizer();
    try {
      const q = pickPngQuantQuality(originalByteLength);
      quantizer.setSpeed(3);
      quantizer.setMaxColors(maxColors);
      quantizer.setQuality(q.min, q.target);
      const quantResult = quantizer.quantizeImage(
        imageData.data,
        imageData.width,
        imageData.height,
      );
      try {
        quantResult.setDithering(0.85);
        const palette = quantResult.getPalette();
        const indices = quantResult.getPaletteIndices(
          imageData.data,
          imageData.width,
          imageData.height,
        );
        const pngBytes = encode_palette_to_png(
          indices,
          palette,
          imageData.width,
          imageData.height,
        );
        let buf = u8ToArrayBuffer(pngBytes);

        try {
          const optimised = await encodePngOxipng(buf);
          if (optimised?.byteLength && optimised.byteLength < buf.byteLength) {
            buf = optimised;
          }
        } catch {
          /* keep quantized png */
        }

        if (!bestBuf || buf.byteLength < bestBuf.byteLength) {
          bestBuf = buf;
        }
        if (buf.byteLength <= targetBytes) break;
      } finally {
        quantResult.free();
      }
    } finally {
      quantizer.free();
    }
  }

  if (!bestBuf) throw new Error("PNG 有损量化失败");
  return bestBuf;
}

async function encodeJpegMoz(imageData, quality) {
  const { default: encode } = await import(CDN.jpegEncode);
  return encode(imageData, {
    quality,
    progressive: true,
    optimize_coding: true,
    trellis_multipass: true,
    trellis_opt_zero: true,
    trellis_opt_table: true,
    auto_subsample: true,
    chroma_subsample: 2,
  });
}

async function encodeJpegNative(imageData, quality) {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext("2d");
  ctx.putImageData(imageData, 0, 0);
  const blob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: Math.min(1, Math.max(0.5, quality / 100)),
  });
  return blob.arrayBuffer();
}

async function encodeJpegSafe(imageData, quality) {
  try {
    return await encodeJpegMoz(imageData, quality);
  } catch (mozErr) {
    console.warn("[compress] MozJPEG failed, fallback native:", mozErr);
    return encodeJpegNative(imageData, quality);
  }
}

async function compressPng(buffer, { allowCrossFormat = false } = {}) {
  const candidates = [];
  let imageData = null;

  try {
    const pngOnly = await encodePngOxipng(buffer);
    if (pngOnly?.byteLength) {
      candidates.push({ buffer: pngOnly, mimeType: "image/png", ext: "png" });
    }
  } catch (error) {
    console.warn("[compress] oxipng failed:", error);
  }

  try {
    imageData = await bufferToImageData(buffer, "image/png");

    try {
      const lossyPng = await encodePngLossy(imageData, buffer.byteLength);
      if (lossyPng?.byteLength) {
        candidates.push({
          buffer: lossyPng,
          mimeType: "image/png",
          ext: "png",
        });
      }
    } catch (error) {
      console.warn("[compress] PNG quantize failed:", error);
    }

    if (allowCrossFormat) {
      const webpQ = pickWebpQuality(buffer.byteLength);
      const webpBuf = await encodeWebpLossy(imageData, webpQ);
      if (webpBuf?.byteLength) {
        candidates.push({
          buffer: webpBuf,
          mimeType: "image/webp",
          ext: "webp",
        });
      }

      const bestSoFar = pickSmaller(buffer, candidates);
      const savedRatio =
        (buffer.byteLength - bestSoFar.size) / buffer.byteLength;
      if (savedRatio < 0.12) {
        const lowerQ = Math.max(70, webpQ - 10);
        const again = await encodeWebpLossy(imageData, lowerQ);
        if (again?.byteLength) {
          candidates.push({
            buffer: again,
            mimeType: "image/webp",
            ext: "webp",
          });
        }
      }

      if (!hasAlpha(imageData)) {
        const jpegQ = pickJpegQuality(buffer.byteLength);
        const jpegBuf = await encodeJpegSafe(imageData, jpegQ);
        if (jpegBuf?.byteLength) {
          candidates.push({
            buffer: jpegBuf,
            mimeType: "image/jpeg",
            ext: "jpg",
          });
        }
      }
    }
  } catch (error) {
    console.warn("[compress] PNG re-encode failed:", error);
  } finally {
    imageData = null;
  }

  const best = pickSmaller(buffer, candidates);
  if (!best.meta) {
    return { buffer, mimeType: "image/png", ext: "png" };
  }
  return {
    buffer: best.buffer,
    mimeType: best.meta.mimeType,
    ext: best.meta.ext,
  };
}

async function compressWebp(buffer, { allowCrossFormat = false } = {}) {
  const candidates = [];
  let imageData = null;

  try {
    try {
      const { default: decode } = await import(CDN.webpDecode);
      imageData = await decode(buffer);
    } catch {
      imageData = await bufferToImageData(buffer, "image/webp");
    }

    const quality = pickWebpQuality(buffer.byteLength);
    const encoded = await encodeWebpLossy(imageData, quality);
    if (encoded?.byteLength) {
      candidates.push({
        buffer: encoded,
        mimeType: "image/webp",
        ext: "webp",
      });
    }

    let bestSoFar = pickSmaller(buffer, candidates);
    let savedRatio = (buffer.byteLength - bestSoFar.size) / buffer.byteLength;
    if (savedRatio < 0.1 && quality > 70) {
      const lowerQ = Math.max(68, quality - 10);
      const again = await encodeWebpLossy(imageData, lowerQ);
      if (again?.byteLength) {
        candidates.push({
          buffer: again,
          mimeType: "image/webp",
          ext: "webp",
        });
      }
    }

    if (allowCrossFormat && !hasAlpha(imageData)) {
      const jpegQ = pickJpegQuality(buffer.byteLength);
      const jpegBuf = await encodeJpegSafe(imageData, jpegQ);
      if (jpegBuf?.byteLength) {
        candidates.push({
          buffer: jpegBuf,
          mimeType: "image/jpeg",
          ext: "jpg",
        });
      }
    }
  } catch (error) {
    console.warn("[compress] WebP re-encode failed:", error);
  } finally {
    imageData = null;
  }

  const best = pickSmaller(buffer, candidates);
  if (!best.meta) {
    return { buffer, mimeType: "image/webp", ext: "webp" };
  }
  return {
    buffer: best.buffer,
    mimeType: best.meta.mimeType,
    ext: best.meta.ext,
  };
}

async function compressJpeg(buffer, { allowCrossFormat = false } = {}) {
  const stripped = stripJpegMetadata(buffer);
  const candidates = [
    { buffer: stripped, mimeType: "image/jpeg", ext: "jpg" },
  ];
  const targetBytes = Math.floor(
    buffer.byteLength * targetSizeRatio(buffer.byteLength),
  );
  let quality = pickJpegQuality(buffer.byteLength);

  let imageData = null;
  try {
    if (buffer.byteLength > 2 * 1024 * 1024) {
      imageData = await bufferToImageData(buffer, "image/jpeg");
    } else {
      try {
        const { default: decode } = await import(CDN.jpegDecode);
        imageData = await decode(buffer);
      } catch {
        imageData = await bufferToImageData(buffer, "image/jpeg");
      }
    }

    for (let pass = 0; pass < 5; pass += 1) {
      const encoded = await encodeJpegSafe(imageData, quality);
      if (encoded?.byteLength) {
        candidates.push({
          buffer: encoded,
          mimeType: "image/jpeg",
          ext: "jpg",
        });
        if (encoded.byteLength <= targetBytes) break;
      }
      if (quality <= JPEG_QUALITY_FLOOR) break;
      quality = Math.max(JPEG_QUALITY_FLOOR, quality - 5);
    }

    if (allowCrossFormat) {
      const webpQ = pickWebpQuality(buffer.byteLength);
      const webpBuf = await encodeWebpLossy(imageData, webpQ);
      if (webpBuf?.byteLength) {
        candidates.push({
          buffer: webpBuf,
          mimeType: "image/webp",
          ext: "webp",
        });
      }
      const bestJpegOrWebp = pickSmaller(buffer, candidates);
      if (bestJpegOrWebp.size > targetBytes && webpQ > 65) {
        const again = await encodeWebpLossy(
          imageData,
          Math.max(65, webpQ - 8),
        );
        if (again?.byteLength) {
          candidates.push({
            buffer: again,
            mimeType: "image/webp",
            ext: "webp",
          });
        }
      }
    }
  } catch (error) {
    console.warn("[compress] JPEG re-encode failed:", error);
  } finally {
    imageData = null;
  }

  const best = pickSmaller(buffer, candidates);
  if (!best.meta) {
    return { buffer: stripped, mimeType: "image/jpeg", ext: "jpg" };
  }
  return {
    buffer: best.buffer,
    mimeType: best.meta.mimeType,
    ext: best.meta.ext,
  };
}

function flattenToOpaque(imageData) {
  if (!hasAlpha(imageData)) return imageData;
  const { width, height, data } = imageData;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    out[i] = Math.round(data[i] * a + 255 * (1 - a));
    out[i + 1] = Math.round(data[i + 1] * a + 255 * (1 - a));
    out[i + 2] = Math.round(data[i + 2] * a + 255 * (1 - a));
    out[i + 3] = 255;
  }
  return new ImageData(out, width, height);
}

async function encodeToTargetFormat(imageData, format, originalByteLength) {
  const normalized = String(format || "jpg").toLowerCase();
  const targetBytes = Math.floor(
    originalByteLength * targetSizeRatio(originalByteLength),
  );

  if (normalized === "png") {
    try {
      const lossy = await encodePngLossy(imageData, originalByteLength);
      return { buffer: lossy, mimeType: "image/png", ext: "png" };
    } catch {
      const pngBuf = await encodePngOxipng(imageData);
      return { buffer: pngBuf, mimeType: "image/png", ext: "png" };
    }
  }

  if (normalized === "webp") {
    let quality = pickWebpQuality(originalByteLength);
    let best = null;
    for (let pass = 0; pass < 4; pass += 1) {
      const encoded = await encodeWebpLossy(imageData, quality);
      if (encoded?.byteLength) {
        if (!best || encoded.byteLength < best.byteLength) best = encoded;
        if (encoded.byteLength <= targetBytes) break;
      }
      if (quality <= 65) break;
      quality = Math.max(65, quality - 8);
    }
    if (!best) throw new Error("WebP 编码失败");
    return { buffer: best, mimeType: "image/webp", ext: "webp" };
  }

  const opaque = flattenToOpaque(imageData);
  let quality = pickJpegQuality(originalByteLength);
  let best = null;
  for (let pass = 0; pass < 5; pass += 1) {
    const encoded = await encodeJpegSafe(opaque, quality);
    if (encoded?.byteLength) {
      if (!best || encoded.byteLength < best.byteLength) best = encoded;
      if (encoded.byteLength <= targetBytes) break;
    }
    if (quality <= JPEG_QUALITY_FLOOR) break;
    quality = Math.max(JPEG_QUALITY_FLOOR, quality - 5);
  }
  if (!best) throw new Error("JPEG 编码失败");
  return { buffer: best, mimeType: "image/jpeg", ext: "jpg" };
}

async function compressAsRaster(
  buffer,
  mimeType,
  { allowCrossFormat = false } = {},
) {
  const imageData = await bufferToImageData(buffer, mimeType);
  const candidates = [];

  try {
    const pngBuf = await encodePngOxipng(imageData);
    if (pngBuf?.byteLength) {
      candidates.push({ buffer: pngBuf, mimeType: "image/png", ext: "png" });
    }
  } catch {
    /* ignore */
  }

  try {
    const lossyPng = await encodePngLossy(imageData, buffer.byteLength);
    if (lossyPng?.byteLength) {
      candidates.push({
        buffer: lossyPng,
        mimeType: "image/png",
        ext: "png",
      });
    }
  } catch {
    /* ignore */
  }

  if (allowCrossFormat) {
    try {
      const webpQ = pickWebpQuality(buffer.byteLength);
      const webpBuf = await encodeWebpLossy(imageData, webpQ);
      if (webpBuf?.byteLength) {
        candidates.push({
          buffer: webpBuf,
          mimeType: "image/webp",
          ext: "webp",
        });
      }
    } catch {
      /* ignore */
    }

    if (!hasAlpha(imageData)) {
      try {
        const jpegQ = pickJpegQuality(buffer.byteLength);
        const jpegBuf = await encodeJpegSafe(imageData, jpegQ);
        if (jpegBuf?.byteLength) {
          candidates.push({
            buffer: jpegBuf,
            mimeType: "image/jpeg",
            ext: "jpg",
          });
        }
      } catch {
        /* ignore */
      }
    }
  }

  const best = pickSmaller(buffer, candidates);
  if (!best.meta) {
    return {
      buffer,
      mimeType: mimeType || "application/octet-stream",
      ext: "bin",
    };
  }
  return {
    buffer: best.buffer,
    mimeType: best.meta.mimeType,
    ext: best.meta.ext,
  };
}

function sourceFormatKey(mimeType, fileName) {
  const normalized = (mimeType || "").toLowerCase();
  if (normalized.includes("png") || /\.png$/i.test(fileName || "")) return "png";
  if (normalized.includes("webp") || /\.webp$/i.test(fileName || "")) {
    return "webp";
  }
  if (
    normalized.includes("jpeg") ||
    normalized.includes("jpg") ||
    /\.jpe?g$/i.test(fileName || "")
  ) {
    return "jpg";
  }
  return null;
}

async function compressImage(buffer, mimeType, options = {}) {
  const {
    keepSourceFormat = true,
    outputFormat = null,
    fileName = "",
  } = options;
  const detected = detectMime(buffer, mimeType);

  if (!keepSourceFormat && outputFormat) {
    const imageData = await bufferToImageData(buffer, detected || mimeType);
    return encodeToTargetFormat(imageData, outputFormat, buffer.byteLength);
  }

  const allowCrossFormat = false;
  const normalized = (detected || mimeType || "").toLowerCase();

  if (normalized === "image/png" || normalized.endsWith("png")) {
    return compressPng(buffer, { allowCrossFormat });
  }
  if (normalized === "image/webp" || normalized.endsWith("webp")) {
    return compressWebp(buffer, { allowCrossFormat });
  }
  if (
    normalized === "image/jpeg" ||
    normalized === "image/jpg" ||
    normalized.endsWith("jpeg") ||
    normalized.endsWith("jpg")
  ) {
    return compressJpeg(buffer, { allowCrossFormat });
  }

  return compressAsRaster(buffer, detected || mimeType, { allowCrossFormat });
}

const cancelledIds = new Set();

self.onmessage = async (event) => {
  const {
    type,
    id,
    buffer,
    mimeType,
    fileName,
    keepSourceFormat = true,
    outputFormat = null,
  } = event.data || {};

  if (type === "cancel") {
    cancelledIds.add(id);
    return;
  }

  if (type !== "compress" || !id || !buffer) {
    return;
  }

  cancelledIds.delete(id);

  try {
    self.postMessage({ type: "progress", id, progress: 8 });

    const forced =
      keepSourceFormat === false &&
      outputFormat &&
      ["jpg", "jpeg", "png", "webp"].includes(
        String(outputFormat).toLowerCase(),
      );

    const result = await compressImage(buffer, mimeType, {
      keepSourceFormat: !forced,
      outputFormat: forced ? outputFormat : null,
      fileName,
    });

    if (cancelledIds.has(id)) {
      cancelledIds.delete(id);
      self.postMessage({ type: "cancelled", id });
      return;
    }

    const sourceKey = sourceFormatKey(mimeType || detectMime(buffer), fileName);
    const resultKey =
      result.ext === "jpeg" ? "jpg" : String(result.ext || "").toLowerCase();
    const formatChanged =
      forced || (sourceKey && resultKey && sourceKey !== resultKey);

    const outBuffer =
      formatChanged || result.buffer.byteLength < buffer.byteLength
        ? result.buffer
        : buffer;
    const outMime =
      outBuffer === buffer
        ? mimeType || detectMime(buffer)
        : result.mimeType;
    const outExt =
      outBuffer === buffer
        ? (fileName?.split(".").pop() || result.ext || "bin").toLowerCase()
        : result.ext;

    self.postMessage(
      {
        type: "done",
        id,
        buffer: outBuffer,
        mimeType: outMime,
        ext: outExt,
        originalSize: buffer.byteLength,
        compressedSize: outBuffer.byteLength,
      },
      [outBuffer],
    );
  } catch (error) {
    if (cancelledIds.has(id)) {
      cancelledIds.delete(id);
      self.postMessage({ type: "cancelled", id });
      return;
    }
    self.postMessage({
      type: "error",
      id,
      message: error?.message || "压缩失败",
    });
  }
};
