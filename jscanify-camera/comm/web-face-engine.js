/**
 * 浏览器端人脸检测（face-api.js）+ 静默炫彩活体（FLXC ONNX）
 * 供 jscanify-camera.html 动态 import 使用
 *
 * 活体模型预处理（ModelScope FLXC）：
 *  按人脸框上下左右各扩展 96/112；短边对称扩至正方形；不足则补 127；
 *  缩放到 128×128，中心裁 112×112。输入为 4 帧 RGB 堆叠 → [1,12,112,112]。
 * 输出 [1,2]，分数越高假体可能性越高（取 spoof 通道）。
 */

const ORT_BASE = new URL("../sdk/onnxruntime-web@1.27.0/dist/", import.meta.url).href;
const FACE_API_JS = new URL(
  "../sdk/face-api.js@0.22.2/dist/face-api.min.js",
  import.meta.url
).href;
const FACE_API_WEIGHTS = new URL(
  "../sdk/face-api.js@0.22.2/weights",
  import.meta.url
).href;

function resolveAsset(relPath) {
  return new URL(relPath, import.meta.url).href;
}

const LIVENESS_MODEL_URL = resolveAsset("./face-models/model.onnx");

const EXPAND_RATIO = 96 / 112;
const PAD_VALUE = 127;
const RESIZE_SIDE = 128;
const CROP_SIDE = 112;
const FRAME_COUNT = 4;
/** 输出通道：与 ModelScope 描述一致，分数越高越可能是假体 */
const SPOOF_INDEX = 1;

let ort = null;
let faceapi = null;
let livenessSession = null;
let modelsLoaded = false;
let loadPromise = null;

const workCanvas = document.createElement("canvas");
const annotateCanvas = document.createElement("canvas");

function loadScript(src, datasetKey) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-face-cdn="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("本地脚本加载失败"))
      );
      // 已加载完成
      if (
        (datasetKey === "ort" && window.ort) ||
        (datasetKey === "faceapi" && window.faceapi)
      ) {
        return resolve();
      }
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.faceCdn = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("本地脚本加载失败: " + src));
    document.head.appendChild(s);
  });
}

async function ensureOrt() {
  if (window.ort) {
    ort = window.ort;
    return ort;
  }
  try {
    await loadScript(ORT_BASE + "ort.all.min.js", "ort");
  } catch {
    await loadScript(ORT_BASE + "ort.min.js", "ort");
  }
  if (!window.ort) throw new Error("onnxruntime-web 未挂载到 window.ort");
  ort = window.ort;
  ort.env.wasm.wasmPaths = ORT_BASE;
  return ort;
}

async function ensureFaceApi() {
  if (window.faceapi?.nets) {
    faceapi = window.faceapi;
    return faceapi;
  }
  await loadScript(FACE_API_JS, "faceapi");
  if (!window.faceapi) throw new Error("face-api.js 未挂载到 window.faceapi");
  faceapi = window.faceapi;
  return faceapi;
}

async function createSession(modelUrl, providers) {
  return ort.InferenceSession.create(modelUrl, {
    executionProviders: providers,
  });
}

/**
 * @param {(evt: { stage: string, status: string, text: string, progress?: number }) => void} onStatus
 */
export async function loadFaceModels(onStatus) {
  if (modelsLoaded && livenessSession && faceapi?.nets?.tinyFaceDetector?.isLoaded) {
    onStatus?.({ stage: "cdn", status: "ready", text: "已就绪", progress: 100 });
    onStatus?.({ stage: "det", status: "ready", text: "就绪", progress: 100 });
    onStatus?.({ stage: "live", status: "ready", text: "就绪", progress: 100 });
    return { ok: true, already: true };
  }
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      onStatus?.({ stage: "cdn", status: "loading", text: "加载 face-api…", progress: 5 });
      await ensureFaceApi();
      onStatus?.({ stage: "cdn", status: "loading", text: "加载 onnxruntime…", progress: 15 });
      await ensureOrt();
      onStatus?.({ stage: "cdn", status: "ready", text: "已就绪", progress: 25 });

      onStatus?.({ stage: "det", status: "loading", text: "加载人脸检测模型…", progress: 35 });
      await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_WEIGHTS);
      onStatus?.({ stage: "det", status: "ready", text: "就绪", progress: 55 });

      onStatus?.({ stage: "live", status: "loading", text: "加载活体模型…", progress: 65 });
      let backend = "webgl";
      try {
        livenessSession = await createSession(LIVENESS_MODEL_URL, ["webgl"]);
      } catch {
        backend = "wasm";
        livenessSession = await createSession(LIVENESS_MODEL_URL, ["wasm"]);
      }
      onStatus?.({
        stage: "live",
        status: "ready",
        text: `就绪 (${backend})`,
        progress: 100,
      });

      modelsLoaded = true;
      return { ok: true, backend };
    } catch (err) {
      modelsLoaded = false;
      livenessSession = null;
      const msg = err.message || "失败";
      if (!faceapi || !ort) {
        onStatus?.({ stage: "cdn", status: "error", text: msg, progress: 0 });
      }
      onStatus?.({ stage: "det", status: "error", text: msg, progress: 0 });
      onStatus?.({ stage: "live", status: "error", text: "失败", progress: 0 });
      throw err;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export function isFaceReady() {
  return (
    modelsLoaded &&
    !!livenessSession &&
    !!faceapi?.nets?.tinyFaceDetector?.isLoaded
  );
}

function canvasToDrawable(canvas) {
  workCanvas.width = canvas.width;
  workCanvas.height = canvas.height;
  const ctx = workCanvas.getContext("2d");
  ctx.drawImage(canvas, 0, 0);
  return workCanvas;
}

/**
 * 从单帧检测人脸框（像素坐标，相对 canvas）
 * @returns {Promise<Array<{x:number,y:number,width:number,height:number,score:number}>>}
 */
export async function detectFacesOnCanvas(sourceCanvas) {
  if (!isFaceReady()) throw new Error("人脸模型尚未就绪");
  if (!sourceCanvas?.width || !sourceCanvas?.height) {
    throw new Error("无效的图像输入");
  }
  const input = canvasToDrawable(sourceCanvas);
  const detections = await faceapi.detectAllFaces(
    input,
    new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 })
  );
  return detections.map((d) => {
    const box = d.box;
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      score: d.score,
    };
  });
}

/**
 * FLXC 裁剪预处理：扩展框 → 正方形 → 128 → center crop 112
 * @returns {{ canvas: HTMLCanvasElement, box: {x0,y0,x1,y1} }}
 */
function cropFaceForLiveness(sourceCanvas, faceBox) {
  const imgW = sourceCanvas.width;
  const imgH = sourceCanvas.height;
  let x0 = faceBox.x;
  let y0 = faceBox.y;
  let x1 = faceBox.x + faceBox.width;
  let y1 = faceBox.y + faceBox.height;
  const bw = Math.max(1, x1 - x0);
  const bh = Math.max(1, y1 - y0);

  // 上下左右各扩展 96/112
  const expandX = bw * EXPAND_RATIO;
  const expandY = bh * EXPAND_RATIO;
  x0 = Math.max(0, x0 - expandX);
  y0 = Math.max(0, y0 - expandY);
  x1 = Math.min(imgW, x1 + expandX);
  y1 = Math.min(imgH, y1 + expandY);

  // 短边对称扩到长边（遇边停止）
  let w = x1 - x0;
  let h = y1 - y0;
  if (w > h) {
    const diff = w - h;
    const top = Math.min(y0, diff / 2);
    const bottom = Math.min(imgH - y1, diff - top);
    y0 -= top;
    y1 += bottom;
  } else if (h > w) {
    const diff = h - w;
    const left = Math.min(x0, diff / 2);
    const right = Math.min(imgW - x1, diff - left);
    x0 -= left;
    x1 += right;
  }

  w = x1 - x0;
  h = y1 - y0;
  const side = Math.max(w, h);

  // 若仍非正方形，短边对称补 127
  const padCanvas = document.createElement("canvas");
  padCanvas.width = side;
  padCanvas.height = side;
  const pctx = padCanvas.getContext("2d");
  pctx.fillStyle = `rgb(${PAD_VALUE},${PAD_VALUE},${PAD_VALUE})`;
  pctx.fillRect(0, 0, side, side);
  const ox = Math.floor((side - w) / 2);
  const oy = Math.floor((side - h) / 2);
  pctx.drawImage(sourceCanvas, x0, y0, w, h, ox, oy, w, h);

  // 缩放到 128×128，再中心裁 112×112
  const resizeCanvas = document.createElement("canvas");
  resizeCanvas.width = RESIZE_SIDE;
  resizeCanvas.height = RESIZE_SIDE;
  resizeCanvas.getContext("2d").drawImage(padCanvas, 0, 0, RESIZE_SIDE, RESIZE_SIDE);

  const margin = Math.floor((RESIZE_SIDE - CROP_SIDE) / 2);
  // 每次返回独立画布，避免多帧处理时共用同一 canvas 被覆盖
  const out = document.createElement("canvas");
  out.width = CROP_SIDE;
  out.height = CROP_SIDE;
  out
    .getContext("2d")
    .drawImage(
      resizeCanvas,
      margin,
      margin,
      CROP_SIDE,
      CROP_SIDE,
      0,
      0,
      CROP_SIDE,
      CROP_SIDE
    );

  return {
    canvas: out,
    box: { x0, y0, x1, y1 },
  };
}

/** 单张 112×112 图 → CHW float32（0~1） */
function faceCropToCHW(canvas112) {
  const ctx = canvas112.getContext("2d", { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, CROP_SIDE, CROP_SIDE);
  const plane = CROP_SIDE * CROP_SIDE;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const o = i * 4;
    out[i] = data[o] / 255;
    out[plane + i] = data[o + 1] / 255;
    out[plane * 2 + i] = data[o + 2] / 255;
  }
  return out;
}

/**
 * 将最多 4 帧人脸图堆叠为 [1,12,112,112]
 * 帧不足时用最后一帧补齐；单图时复制 4 份
 */
function stackFramesToTensor(cropCanvases) {
  const frames = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    frames.push(cropCanvases[Math.min(i, cropCanvases.length - 1)]);
  }
  const plane = CROP_SIDE * CROP_SIDE;
  const data = new Float32Array(FRAME_COUNT * 3 * plane);
  frames.forEach((c, fi) => {
    const chw = faceCropToCHW(c);
    data.set(chw, fi * 3 * plane);
  });
  return new ort.Tensor("float32", data, [1, FRAME_COUNT * 3, CROP_SIDE, CROP_SIDE]);
}

function faceLabelColor(live) {
  const isLive = live ? live.isLive : null;
  return isLive === true ? "#1ec8a5" : isLive === false ? "#e85d5d" : "#e8a838";
}

function faceOverlayLabel(face, live) {
  let label = `人脸 ${(face.score * 100).toFixed(0)}%`;
  if (live) {
    label += live.isLive
      ? ` · 真人 ${(live.liveProb * 100).toFixed(1)}%`
      : ` · 假体 ${(live.spoofProb * 100).toFixed(1)}%`;
  }
  return label;
}

function paintFaceBoxes(ctx, width, faces, livenessList) {
  const lw = Math.max(2, Math.round(width / 400));
  ctx.font = `bold ${Math.max(12, Math.round(width / 55))}px "Microsoft YaHei", sans-serif`;
  ctx.lineWidth = lw;
  faces.forEach((f, i) => {
    const live = livenessList?.[i];
    const color = faceLabelColor(live);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.strokeRect(f.x, f.y, f.width, f.height);
    const label = faceOverlayLabel(f, live);
    const ty = Math.max(14, f.y - 6);
    // 文字描边，提升在复杂背景上的可读性
    ctx.lineWidth = Math.max(2, Math.round(lw * 0.6));
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.strokeText(label, f.x, ty);
    ctx.fillStyle = color;
    ctx.fillText(label, f.x, ty);
    ctx.lineWidth = lw;
  });
}

function drawFacesOnCanvas(sourceCanvas, faces, livenessList) {
  const ctx = annotateCanvas.getContext("2d");
  annotateCanvas.width = sourceCanvas.width;
  annotateCanvas.height = sourceCanvas.height;
  ctx.drawImage(sourceCanvas, 0, 0);
  paintFaceBoxes(ctx, sourceCanvas.width, faces, livenessList);
  return annotateCanvas.toDataURL("image/jpeg", 0.88);
}

/**
 * 在透明叠加画布上绘制人脸框 / 置信度 / 活体结果（不绘制底图）
 * @param {HTMLCanvasElement} overlayCanvas
 * @param {number} width
 * @param {number} height
 * @param {Array} faces
 * @param {Array|null} livenessList
 */
export function paintFacesOnOverlay(overlayCanvas, width, height, faces, livenessList) {
  overlayCanvas.width = width;
  overlayCanvas.height = height;
  const ctx = overlayCanvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  if (faces?.length) {
    paintFaceBoxes(ctx, width, faces, livenessList);
  }
}

function formatFaceResultText(faces, liveness, mode) {
  if (!faces.length) return "未检测到人脸";
  return faces
    .map((f, i) => {
      const base = `人脸#${i + 1} 置信度 ${(f.score * 100).toFixed(1)}%  位置(${Math.round(f.x)},${Math.round(f.y)},${Math.round(f.width)}×${Math.round(f.height)})`;
      if (mode !== "liveness" || !liveness[i]) return base;
      const L = liveness[i];
      return (
        base +
        `  ${L.isLive ? "真人" : "假体"}  真人 ${(L.liveProb * 100).toFixed(1)}% / 假体 ${(L.spoofProb * 100).toFixed(1)}%`
      );
    })
    .join("\n");
}

/**
 * 检测人脸，可选活体；不生成标注图（供实时预览）
 * @param {HTMLCanvasElement|HTMLCanvasElement[]} source
 * @param {'detect'|'liveness'} mode
 * @param {(pct:number, step:string)=>void} [onProgress]
 */
export async function analyzeFacesOnCanvas(source, mode = "liveness", onProgress) {
  if (!isFaceReady()) throw new Error("人脸模型尚未就绪");

  const frames = Array.isArray(source) ? source.filter(Boolean) : [source];
  if (!frames.length || !frames[0].width) throw new Error("无效的图像输入");

  const primary = frames[0];
  onProgress?.(10, "检测人脸…");
  const faces = await detectFacesOnCanvas(primary);

  if (!faces.length) {
    onProgress?.(100, "完成");
    return {
      faces: [],
      liveness: [],
      resultText: "未检测到人脸",
      type: mode,
      faceCount: 0,
      width: primary.width,
      height: primary.height,
    };
  }

  let liveness = [];
  if (mode === "liveness") {
    onProgress?.(40, "活体推理…");
    for (let i = 0; i < faces.length; i++) {
      const crops = frames.map((fr) => cropFaceForLiveness(fr, faces[i]).canvas);
      const tensor = stackFramesToTensor(crops);
      const inputName = livenessSession.inputNames[0];
      const outMap = await livenessSession.run({ [inputName]: tensor });
      const out = outMap[livenessSession.outputNames[0]];
      const probs = Array.from(out.data);
      const spoofProb = probs[SPOOF_INDEX] ?? probs[0] ?? 0;
      const liveProb = probs[1 - SPOOF_INDEX] ?? 1 - spoofProb;
      // 阈值：假体分 ≥ 0.5 判为假体
      const isLive = spoofProb < 0.5;
      liveness.push({
        spoofProb,
        liveProb,
        isLive,
        probs,
      });
      onProgress?.(
        40 + Math.round(((i + 1) / faces.length) * 55),
        `活体 ${i + 1}/${faces.length}`
      );
    }
  }

  onProgress?.(100, "完成");
  return {
    faces,
    liveness,
    resultText: formatFaceResultText(faces, liveness, mode),
    type: mode,
    faceCount: faces.length,
    width: primary.width,
    height: primary.height,
  };
}

/**
 * @param {HTMLCanvasElement|HTMLCanvasElement[]} source
 *   单画布，或 2~4 帧画布数组（摄像头连拍更利于炫彩活体）
 * @param {'detect'|'liveness'} mode
 * @param {(pct:number, step:string)=>void} [onProgress]
 */
export async function runFaceOnCanvas(source, mode = "liveness", onProgress) {
  const frames = Array.isArray(source) ? source.filter(Boolean) : [source];
  if (!frames.length || !frames[0].width) throw new Error("无效的图像输入");
  const primary = frames[0];
  const sourceDataUrl = primary.toDataURL("image/jpeg", 0.88);

  const analyzed = await analyzeFacesOnCanvas(source, mode, (pct, step) => {
    // 为标注预留末段进度
    onProgress?.(Math.min(90, pct), step);
  });

  if (!analyzed.faces.length) {
    onProgress?.(100, "完成");
    return {
      imageDataUrl: sourceDataUrl,
      annotatedDataUrl: sourceDataUrl,
      faces: [],
      liveness: [],
      resultText: "未检测到人脸",
      type: mode,
      faceCount: 0,
    };
  }

  onProgress?.(95, "绘制结果…");
  const annotatedDataUrl = drawFacesOnCanvas(
    primary,
    analyzed.faces,
    mode === "liveness" ? analyzed.liveness : null
  );
  onProgress?.(100, "完成");
  return {
    imageDataUrl: sourceDataUrl,
    annotatedDataUrl,
    faces: analyzed.faces,
    liveness: analyzed.liveness,
    resultText: analyzed.resultText,
    type: mode,
    faceCount: analyzed.faceCount,
  };
}
