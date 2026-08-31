/**
 * 浏览器端 PP-OCRv6 tiny + onnxruntime-web
 * 供 jscanify-camera.html 动态 import 使用
 */
import {
  confColor,
  cropImageData,
  ctcDecode,
  dbBoxes,
  rgbaToCHW,
} from "./ocr-utils.js";
import { parseIdCard } from "./parse-id-card.js";
import { parseBankCard } from "./parse-bank-card.js";
import { parseInvoice } from "./invoice-parse/parse.js";
import { parseBusinessLicense } from "./business-license-parse/parse.js";

const ORT_BASE = new URL("../sdk/onnxruntime-web@1.27.0/dist/", import.meta.url).href;
const DET_MAX_SIDE = 960;
const DET_MEAN = [0.485, 0.456, 0.406];
const DET_STD = [0.229, 0.224, 0.225];
const REC_MEAN = [0.5, 0.5, 0.5];
const REC_STD = [0.5, 0.5, 0.5];
const REC_HEIGHT = 48;

function resolveAsset(relPath) {
  return new URL(relPath, import.meta.url).href;
}

const DET_MODEL_URL = resolveAsset("./models/PP-OCRv6_det_tiny.onnx");
const REC_MODEL_URL = resolveAsset("./models/PP-OCRv6_rec_tiny.onnx");
const KEYS_URL = resolveAsset("./tiny/ppocr_keys_v6_tiny.json");

let ort = null;
let detSession = null;
let recSession = null;
let charList = null;
let modelsLoaded = false;
let loadPromise = null;

const offCanvas = document.createElement("canvas");
const cropCanvas = document.createElement("canvas");
const annotateCanvas = document.createElement("canvas");

function getOffCtx() {
  return offCanvas.getContext("2d", { willReadFrequently: true });
}

function getCropCtx() {
  return cropCanvas.getContext("2d", { willReadFrequently: true });
}

function resizeImageData(imgSource, targetW, targetH) {
  const ctx = getOffCtx();
  offCanvas.width = targetW;
  offCanvas.height = targetH;
  ctx.clearRect(0, 0, targetW, targetH);
  ctx.drawImage(imgSource, 0, 0, targetW, targetH);
  return ctx.getImageData(0, 0, targetW, targetH);
}

function imageDataToDrawable(imgData) {
  const ctx = getCropCtx();
  cropCanvas.width = imgData.width;
  cropCanvas.height = imgData.height;
  ctx.putImageData(imgData, 0, 0);
  return cropCanvas;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-ocr-cdn="${src}"]`);
    if (existing) {
      if (window.ort) return resolve(window.ort);
      existing.addEventListener("load", () => resolve(window.ort));
      existing.addEventListener("error", () => reject(new Error("本地脚本加载失败")));
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.ocrCdn = src;
    s.onload = () => {
      if (!window.ort) reject(new Error("onnxruntime-web 未挂载到 window.ort"));
      else resolve(window.ort);
    };
    s.onerror = () => reject(new Error("本地脚本加载失败: " + src));
    document.head.appendChild(s);
  });
}

async function createSession(modelUrl, providers) {
  return ort.InferenceSession.create(modelUrl, {
    executionProviders: providers,
  });
}

/**
 * @param {(evt: { stage: string, status: string, text: string, progress?: number }) => void} onStatus
 */
export async function loadOcrModels(onStatus) {
  if (modelsLoaded && detSession && recSession) {
    onStatus?.({ stage: "cdn", status: "ready", text: "已就绪", progress: 100 });
    onStatus?.({ stage: "det", status: "ready", text: "就绪", progress: 100 });
    onStatus?.({ stage: "rec", status: "ready", text: "就绪", progress: 100 });
    return { ok: true, already: true };
  }
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      onStatus?.({ stage: "cdn", status: "loading", text: "加载中…", progress: 5 });
      // ort.all 含 webgl + wasm，失败时再回退 ort.min（wasm）
      try {
        ort = await loadScript(ORT_BASE + "ort.all.min.js");
      } catch {
        ort = await loadScript(ORT_BASE + "ort.min.js");
      }
      ort.env.wasm.wasmPaths = ORT_BASE;
      onStatus?.({ stage: "cdn", status: "ready", text: "已就绪", progress: 20 });

      onStatus?.({ stage: "det", status: "loading", text: "加载字符集…", progress: 25 });
      const keysRes = await fetch(KEYS_URL);
      if (!keysRes.ok) throw new Error("字符集加载失败");
      const keysJson = await keysRes.json();
      charList = ["", ...keysJson, " "];

      onStatus?.({ stage: "det", status: "loading", text: "加载检测模型…", progress: 35 });
      let backend = "webgl";
      try {
        detSession = await createSession(DET_MODEL_URL, ["webgl"]);
      } catch {
        backend = "wasm";
        detSession = await createSession(DET_MODEL_URL, ["wasm"]);
      }
      onStatus?.({
        stage: "det",
        status: "ready",
        text: `就绪 (${backend})`,
        progress: 60,
      });

      onStatus?.({ stage: "rec", status: "loading", text: "加载识别模型…", progress: 70 });
      recSession = await createSession(REC_MODEL_URL, [backend]);
      onStatus?.({ stage: "rec", status: "ready", text: "就绪", progress: 100 });

      modelsLoaded = true;
      return { ok: true, backend };
    } catch (err) {
      modelsLoaded = false;
      detSession = null;
      recSession = null;
      charList = null;
      const msg = err.message || "失败";
      if (!ort) {
        onStatus?.({ stage: "cdn", status: "error", text: msg, progress: 0 });
      }
      onStatus?.({ stage: "det", status: "error", text: msg, progress: 0 });
      onStatus?.({ stage: "rec", status: "error", text: "失败", progress: 0 });
      throw err;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export function isOcrReady() {
  return modelsLoaded && !!detSession && !!recSession;
}

function drawResultsOnCanvas(imgData, ocrResults) {
  const ctx = annotateCanvas.getContext("2d");
  annotateCanvas.width = imgData.width;
  annotateCanvas.height = imgData.height;
  ctx.clearRect(0, 0, annotateCanvas.width, annotateCanvas.height);
  ctx.putImageData(imgData, 0, 0);
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 4;

  for (const r of ocrResults) {
    const conf =
      typeof r.confidence === "number" && isFinite(r.confidence)
        ? r.confidence
        : 0.05;
    const color = confColor(conf);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, Math.round(imgData.width / 400));
    ctx.font = `bold ${Math.max(12, Math.round(imgData.width / 60))}px "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = color;
    ctx.strokeRect(r.box.x0, r.box.y0, r.box.x1 - r.box.x0, r.box.y1 - r.box.y0);
    ctx.fillText(
      `${r.text} (${(conf * 100).toFixed(1)}%)`,
      r.box.x0,
      Math.max(14, r.box.y0 - 6)
    );
  }
  ctx.shadowBlur = 0;
  return annotateCanvas.toDataURL("image/jpeg", 0.88);
}

function canvasToImageData(canvas) {
  const c = document.createElement("canvas");
  c.width = canvas.width;
  c.height = canvas.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(canvas, 0, 0);
  return { canvas: c, imageData: ctx.getImageData(0, 0, c.width, c.height) };
}

/**
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {'general'|'idCard'|'bankCard'|'invoice'|'businessLicense'} type
 * @param {(pct: number, step: string) => void} [onProgress]
 */
export async function runOcrOnCanvas(sourceCanvas, type = "general", onProgress) {
  if (!isOcrReady()) throw new Error("OCR 模型尚未就绪");
  if (!sourceCanvas?.width || !sourceCanvas?.height) {
    throw new Error("无效的图像输入");
  }

  const { canvas, imageData: imgData } = canvasToImageData(sourceCanvas);
  const origW = imgData.width;
  const origH = imgData.height;
  const sourceDataUrl = canvas.toDataURL("image/jpeg", 0.88);

  onProgress?.(5, "图像预处理…");
  const r = Math.min(1, DET_MAX_SIDE / Math.max(origW, origH));
  const detW = Math.max(32, Math.round((origW * r) / 32) * 32);
  const detH = Math.max(32, Math.round((origH * r) / 32) * 32);

  const detResized = resizeImageData(canvas, detW, detH);
  if (!detResized) throw new Error("预处理失败");

  const chw = rgbaToCHW(detResized, DET_MEAN, DET_STD);
  const detTensor = new ort.Tensor("float32", chw, [1, 3, detH, detW]);

  onProgress?.(15, "检测模型推理…");
  const detResult = await detSession.run({ x: detTensor });
  const detOutput = detResult[detSession.outputNames[0]];
  const probData = detOutput.data;
  const probH = detOutput.dims[2];
  const probW = detOutput.dims[3];
  const scaleX = origW / probW;
  const scaleY = origH / probH;

  onProgress?.(25, "提取文本框…");
  const boxes = dbBoxes(probData, probW, probH, scaleX, scaleY);

  if (!boxes.length) {
    onProgress?.(100, "完成");
    return {
      type,
      imageDataUrl: sourceDataUrl,
      annotatedDataUrl: sourceDataUrl,
      results: [],
      fullText: "",
      resultText: "未检测到文本",
      structured: null,
    };
  }

  const ocrResults = [];
  const totalBoxes = boxes.length;

  for (let i = 0; i < totalBoxes; i++) {
    const pct = 30 + Math.round((i / totalBoxes) * 60);
    onProgress?.(pct, `识别第 ${i + 1}/${totalBoxes} 个区域…`);

    const b = boxes[i];
    const cw = b.x1 - b.x0;
    const ch = b.y1 - b.y0;
    if (cw < 2 || ch < 2) continue;

    const cropped = cropImageData(imgData, b.x0, b.y0, cw, ch);
    if (!cropped) continue;

    const recW = Math.max(8, Math.round((REC_HEIGHT * cw) / ch));
    const finalRecW = Math.min(recW, 2400);
    const imgSource = imageDataToDrawable(cropped);
    if (!imgSource) continue;

    const recResized = resizeImageData(imgSource, finalRecW, REC_HEIGHT);
    if (!recResized) continue;

    const recInput = rgbaToCHW(recResized, REC_MEAN, REC_STD);
    const recTensor = new ort.Tensor("float32", recInput, [
      1,
      3,
      REC_HEIGHT,
      finalRecW,
    ]);

    const recResult = await recSession.run({ x: recTensor });
    const recOutput = recResult[recSession.outputNames[0]];
    const T = recOutput.dims[1];
    const C = recOutput.dims[2];
    const decoded = ctcDecode(recOutput.data, T, C, charList);
    const text = decoded.text.trim();
    if (text) {
      ocrResults.push({
        box: b,
        text,
        confidence: decoded.confidence,
        charCount: decoded.charCount,
      });
    }
  }

  onProgress?.(92, "绘制标注…");
  const annotatedDataUrl = drawResultsOnCanvas(imgData, ocrResults);
  const fullText = ocrResults.map((item) => item.text).join("\n");
  const lines = ocrResults.map((item) => item.text);

  let structured = null;
  let resultText = fullText || "未识别到文字";

  if (type === "idCard") {
    structured = parseIdCard(lines);
    resultText = formatIdCardResult(structured, fullText);
  } else if (type === "bankCard") {
    structured = parseBankCard(lines);
    resultText = formatBankCardResult(structured, fullText);
  } else if (type === "invoice") {
    // 发票表格解析需要坐标，传入完整 OCR 结果
    structured = parseInvoice(ocrResults);
    resultText = formatInvoiceResult(structured, fullText);
  } else if (type === "businessLicense") {
    structured = parseBusinessLicense(ocrResults);
    resultText = formatBusinessLicenseResult(structured, fullText);
  }

  onProgress?.(100, "完成");
  return {
    type,
    imageDataUrl: sourceDataUrl,
    annotatedDataUrl,
    results: ocrResults,
    fullText,
    resultText,
    structured,
  };
}

function formatIdCardResult(info, fullText) {
  if (!info?.isIdCard) {
    return (info?.message || "未识别为身份证") + (fullText ? "\n\n原文:\n" + fullText : "");
  }
  if (info.side === "front" && info.front) {
    const f = info.front;
    return [
      "【身份证正面】",
      `姓名：${f.name}`,
      `性别：${f.gender}`,
      `民族：${f.nation}`,
      `出生：${f.birth}`,
      `住址：${f.address}`,
      `公民身份号码：${f.idNumber}`,
    ].join("\n");
  }
  if (info.side === "back" && info.back) {
    const b = info.back;
    return [
      "【身份证背面】",
      `签发机关：${b.authority}`,
      `有效期限：${b.validPeriod}`,
    ].join("\n");
  }
  return fullText || "识别完成";
}

function formatBankCardResult(info, fullText) {
  if (!info?.isBankCard) {
    return (info?.message || "未识别为银行卡") + (fullText ? "\n\n原文:\n" + fullText : "");
  }
  const lines = [
    "【银行卡】",
    `银行：${info.bank}`,
    `账号：${info.account}`,
  ];
  if (info.message) lines.push(info.message);
  return lines.join("\n");
}

function formatInvoiceResult(info, fullText) {
  if (!info?.isInvoice) {
    return (info?.message || "未识别为发票") + (fullText ? "\n\n原文:\n" + fullText : "");
  }
  const lines = [
    "【发票识别】",
    `发票标题：${info.title}`,
    `发票号码：${info.invoiceNumber}`,
    `开票日期：${info.invoiceDate}`,
    `税务局：${info.taxBureau}`,
    "",
    "【购买方】",
    `名称：${info.buyerName}`,
    `统一社会信用代码/纳税人识别号：${info.buyerTaxId}`,
    "",
    "【销售方】",
    `名称：${info.sellerName}`,
    `统一社会信用代码/纳税人识别号：${info.sellerTaxId}`,
  ];

  if (info.items?.length) {
    lines.push("", "【项目明细】");
    info.items.forEach((item, idx) => {
      lines.push(
        `${idx + 1}. ${item.name || "—"} | 规格:${item.spec || "—"} | 单位:${item.unit || "—"} | 数量:${item.quantity || "—"} | 单价:${item.unitPrice || "—"} | 金额:${item.amount || "—"} | 税率:${item.taxRate || "—"} | 税额:${item.taxAmount || "—"}`
      );
    });
  }

  lines.push(
    "",
    `合计金额：${info.totalAmount}`,
    `合计税额：${info.totalTaxAmount}`,
    `价税合计（大写）：${info.priceTaxUpper}`,
    `价税合计（小写）：${info.priceTaxLower}`,
    `备注：${info.remark}`,
    `开票人：${info.issuer}`
  );
  return lines.join("\n");
}

function formatBusinessLicenseResult(info, fullText) {
  if (!info?.isBusinessLicense) {
    return (
      (info?.message || "未识别为营业执照") +
      (fullText ? "\n\n原文:\n" + fullText : "")
    );
  }
  return [
    "【营业执照】",
    `统一社会信用代码：${info.creditCode}`,
    `名称：${info.name}`,
    `类型：${info.type}`,
    `法定代表人：${info.legalPerson}`,
    `注册资本：${info.registeredCapital}`,
    `成立日期：${info.establishDate}`,
    `住所：${info.address}`,
    `经营范围：${info.businessScope}`,
    `登记机关：${info.registrationAuthority}`,
    `登记日期：${info.registrationDate}`,
  ].join("\n");
}

export {
  parseIdCard,
  parseBankCard,
  parseInvoice,
  parseBusinessLicense,
  confColor,
};
