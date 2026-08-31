/** RGBA ImageData → CHW float32，按 mean/std 归一化 */
export function rgbaToCHW(imageData, mean, std) {
  const { data, width, height } = imageData;
  const chw = new Float32Array(3 * height * width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const di = y * width + x;
      for (let c = 0; c < 3; c++) {
        chw[c * height * width + di] = (data[si + c] / 255 - mean[c]) / std[c];
      }
    }
  }
  return chw;
}

/** 将 ImageData 裁剪为矩形区域 */
export function cropImageData(imgData, x, y, w, h) {
  x = Math.max(0, Math.floor(x));
  y = Math.max(0, Math.floor(y));
  w = Math.min(Math.floor(w), imgData.width - x);
  h = Math.min(Math.floor(h), imgData.height - y);
  if (w <= 0 || h <= 0) return null;

  const cropped = new ImageData(w, h);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const si = ((y + row) * imgData.width + (x + col)) * 4;
      const di = (row * w + col) * 4;
      cropped.data[di] = imgData.data[si];
      cropped.data[di + 1] = imgData.data[si + 1];
      cropped.data[di + 2] = imgData.data[si + 2];
      cropped.data[di + 3] = imgData.data[si + 3];
    }
  }
  return cropped;
}

/**
 * DBNet 后处理：BFS 连通域 → unclip 外扩
 * @returns {{ x0:number, y0:number, x1:number, y1:number, cy:number }[]}
 */
export function dbBoxes(probData, ow, oh, scaleX, scaleY) {
  const thresh = 0.2;
  const boxThresh = 0.4;
  const unclip = 1.4;
  const minSide = 3;

  const bin = new Uint8Array(ow * oh);
  for (let i = 0; i < ow * oh; i++) bin[i] = probData[i] > thresh ? 1 : 0;

  const label = new Int32Array(ow * oh).fill(0);
  let curLabel = 0;
  const stack = new Int32Array(ow * oh);
  const boxes = [];

  for (let s = 0; s < ow * oh; s++) {
    if (bin[s] !== 1 || label[s] !== 0) continue;
    curLabel++;
    let sp = 0;
    stack[sp++] = s;
    label[s] = curLabel;

    let minX = ow;
    let minY = oh;
    let maxX = 0;
    let maxY = 0;
    let sum = 0;
    let cnt = 0;

    while (sp > 0) {
      const p = stack[--sp];
      const px = p % ow;
      const py = (p / ow) | 0;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      sum += probData[p];
      cnt++;

      if (px > 0 && bin[p - 1] && !label[p - 1]) {
        label[p - 1] = curLabel;
        stack[sp++] = p - 1;
      }
      if (px < ow - 1 && bin[p + 1] && !label[p + 1]) {
        label[p + 1] = curLabel;
        stack[sp++] = p + 1;
      }
      if (py > 0 && bin[p - ow] && !label[p - ow]) {
        label[p - ow] = curLabel;
        stack[sp++] = p - ow;
      }
      if (py < oh - 1 && bin[p + ow] && !label[p + ow]) {
        label[p + ow] = curLabel;
        stack[sp++] = p + ow;
      }
    }

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    if (Math.min(bw, bh) < minSide) continue;
    if (sum / cnt < boxThresh) continue;

    const area = bw * bh;
    const peri = 2 * (bw + bh);
    const d = (area * unclip) / peri;
    const x0 = Math.max(0, minX - d) * scaleX;
    const y0 = Math.max(0, minY - d) * scaleY;
    const x1 = Math.min(ow, maxX + d) * scaleX;
    const y1 = Math.min(oh, maxY + d) * scaleY;
    boxes.push({ x0, y0, x1, y1, cy: ((minY + maxY) / 2) * scaleY });
  }

  boxes.sort((a, b) =>
    Math.abs(a.cy - b.cy) > 10 ? a.cy - b.cy : a.x0 - b.x0
  );
  return boxes;
}

/** CTC 贪心解码 */
export function ctcDecode(data, T, C, charList) {
  const result = { text: "", confidences: [], confidence: 0, charCount: 0 };
  let prev = -1;

  for (let t = 0; t < T; t++) {
    let maxV = -1e9;
    let idx = 0;
    const base = t * C;
    for (let c = 0; c < C; c++) {
      const v = data[base + c];
      if (!isFinite(v)) continue;
      if (v > maxV) {
        maxV = v;
        idx = c;
      }
    }
    if (maxV === -1e9) continue;

    if (idx !== 0 && idx !== prev) {
      let sumE = 0;
      for (let c = 0; c < C; c++) {
        const diff = data[base + c] - maxV;
        if (diff < -50 || !isFinite(diff)) continue;
        sumE += Math.exp(diff);
      }
      const p = sumE > 0 ? 1 / sumE : 0.001;
      result.text += charList[idx] || "�";
      result.confidences.push(Math.max(0.001, Math.min(p, 0.999)));
      result.charCount++;
    }
    prev = idx;
  }

  if (result.charCount > 0) {
    result.confidence =
      result.confidences.reduce((a, b) => a + b, 0) / result.charCount;
  }
  return result;
}

export function confColor(conf) {
  if (conf > 0.04) return "#16a34a";
  if (conf > 0.02) return "#ca8a04";
  return "#ea580c";
}
