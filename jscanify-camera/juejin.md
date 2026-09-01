# 纯前端高拍仪工作台：OpenCV.js + jscanify 实现文档扫描、扫码、OCR 与人脸识别

## 前言

传统高拍仪方案往往绑定厂商 SDK（如 Dynamsoft Camera SDK），授权成本高、部署重，也不利于在 Web 端快速落地。

本文介绍一套**纯浏览器高拍仪 / 文档扫描工作台**：用 `getUserMedia` 接管摄像头，用 **OpenCV.js + jscanify** 做文档边缘检测与透视矫正，再用 **@zxing/library**、浏览器端 **PP-OCRv6**、**face-api.js + ONNX 活体模型**补齐扫码、证件 OCR、人脸检测能力。

核心目标：

- **零后端**：图像处理与识别均在浏览器本地完成，适合内网 / 离线静态站
- **可替代 SDK**：覆盖文档拍摄、纠偏裁剪、条码识别、证件 OCR、人脸预览等常见高拍仪场景
- **按需加载**：OCR / 人脸模型体积较大，仅在开启对应模块时动态加载

> 在线演示（GitHub Pages）：[https://archernull.github.io/jscanify-camera/](https://archernull.github.io/jscanify-camera/)  
> 仓库地址：[https://github.com/ArcherNull/ArcherNull.github.io/tree/main/jscanify-camera](https://github.com/ArcherNull/ArcherNull.github.io/tree/main/jscanify-camera)

---

## 环境

### 运行要求

| 项 | 说明 |
|----|------|
| 浏览器 | Chrome / Edge 等现代浏览器（需支持 `getUserMedia`、Canvas、WebAssembly） |
| 访问协议 | **localhost** 或 **HTTPS**（否则无法打开摄像头） |
| 设备 | USB 高拍仪 / 笔记本摄像头 / 手机后置摄像头均可 |
| 部署方式 | 纯静态资源，可直接放 GitHub Pages / Nginx / 任意静态服务器 |

### 技术栈一览

| 能力 | 依赖库 | 加载方式 |
|------|--------|----------|
| 摄像头预览 | 浏览器 `navigator.mediaDevices.getUserMedia` | 原生 API |
| 图像处理底层 | OpenCV.js `4.7.0` | 页面首屏引入 |
| 文档边缘检测 / 透视矫正 | jscanify `1.4.0` | 页面首屏引入 |
| 条形码 / 二维码 | `@zxing/library` `0.21.3`（可选回退 `BarcodeDetector`） | 页面首屏引入 |
| 证件 / 发票 OCR | PP-OCRv6 tiny + `onnxruntime-web` `1.27.0` | 按需动态 `import` |
| 人脸检测 / 活体 | face-api.js `0.22.2` + FLXC ONNX | 按需动态 `import` |

本地依赖目录结构示意：

```text
jscanify-camera/
├── index.html              # 工作台主页面
├── sdk/                    # 离线第三方库（不再依赖 CDN）
│   ├── opencv@4.7.0/
│   ├── jscanify@1.4.0/
│   ├── @zxing/library@0.21.3/
│   ├── onnxruntime-web@1.27.0/
│   └── face-api.js@0.22.2/
└── comm/                   # OCR / 人脸引擎与解析脚本
    ├── web-ocr-engine.js
    ├── web-face-engine.js
    ├── models/             # PP-OCRv6 det / rec
    └── face-models/        # 活体 ONNX
```

页面头部直接引入基础 SDK：

```html
<script async src="./sdk/opencv@4.7.0/opencv.js"></script>
<script src="./sdk/jscanify@1.4.0/src/jscanify.min.js"></script>
<script src="./sdk/@zxing/library@0.21.3/umd/index.min.js"></script>
```

本地启动示例：

```bash
# 任意静态服务器均可，注意要用 http://localhost 打开
npx serve jscanify-camera
# 或
python -m http.server 8080
```

---

## 功能预览

页面整体分为四块：

| 区域 | 说明 |
|------|------|
| 顶部栏 | 产品名、运行状态、分辨率、FPS、jscanify 版本 |
| 左侧舞台 | 摄像头预览、文档高亮叠加、人脸框、ROI 框选、自动拍摄倒计时 |
| 右侧面板 | 四个 Tab：相机 / 扫描 / 拍摄 / 日志 |
| 底部相册 | 拍摄记录缩略图：预览、下载、重命名、清空 |

能力速览：

1. **摄像头与预览**：开 / 关 / 暂停、切换设备与分辨率、画面适配与缩放、旋转、移动端手电筒
2. **文档扫描**：实时边缘高亮、透视纠偏、拍摄时自动裁剪；支持本地图片检测与提取
3. **拍摄与相册**：单张拍摄、自动连拍（倒计时）、整帧拍照、连续取帧缓冲
4. **识别策略联动拍摄**：拍摄时可识别条码 / 二维码 / 身份证 / 银行卡 / 发票 / 营业执照，并用识别内容命名入库
5. **图片识别模块**：扫码、浏览器 OCR、人脸检测 / 活体（上传图优先于摄像头画面）
6. **预览编辑**：缩放、旋转、框选剪裁、文档再裁剪、保存回相册
7. **运行日志**：记录初始化、拍摄、识别成败与异常

> 建议在掘金正文此处插入 2～3 张界面截图：舞台预览 + 扫描高亮、OCR 结果弹窗、底部相册。

推荐使用场景：

- **场景 A**：文档高清扫描入库 → 开启纠偏 / 自动裁剪 → 拍摄 → 相册下载
- **场景 B**：拍摄并按证件 / 条码命名 → 勾选识别策略 → 拍摄入库
- **场景 C**：仅识别不拍摄 → 相机 Tab 选扫码 / OCR / 人脸
- **场景 D**：批量自动连拍 → 设置间隔 → 舞台「拍摄」开始 / 停止

---

## 功能

### 1. SDK 初始化

**依赖库**：OpenCV.js、jscanify、@zxing/library

页面加载后先等待 OpenCV WASM 就绪，再实例化 `jscanify`，并探测 ZXing 是否可用。

```js
async function initSDK() {
  // 失败重试时可重新注入本地脚本
  if (typeof cv === "undefined") {
    await ensureScript("./sdk/opencv@4.7.0/opencv.js", () => typeof cv !== "undefined");
  }
  if (typeof jscanify === "undefined") {
    await ensureScript(
      "./sdk/jscanify@1.4.0/src/jscanify.min.js",
      () => typeof jscanify !== "undefined"
    );
  }

  await waitForOpenCV();          // 等待 cv['onRuntimeInitialized']
  scanner = new jscanify();       // 文档扫描器实例

  if (getZXing()?.BrowserMultiFormatReader) {
    console.log("@zxing/library 已加载");
  }
  await refreshCameras();         // enumerateDevices 枚举摄像头
}
```

---

### 2. 摄像头预览与控制

**依赖库**：浏览器原生 MediaDevices API（无第三方）

打开摄像头时按「设备 ID + 理想分辨率」构造约束；移动端无设备 ID 时优先后置摄像头，便于使用手电筒。

```js
async function openCamera() {
  const [w, h] = resolution.split("x").map(Number); // 如 1920x1080
  const videoConstraints = {
    width: { ideal: w },
    height: { ideal: h }
  };
  if (deviceId) {
    videoConstraints.deviceId = { exact: deviceId };
  } else if (isMobileLike()) {
    videoConstraints.facingMode = { ideal: "environment" };
  }

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: videoConstraints
  });
  videoEl.srcObject = mediaStream;
  await videoEl.play();

  // 从 video 抓帧到离屏 canvas，供扫描 / 识别复用
  startFpsMeter();
  scheduleDetect(); // 若开启实时高亮则启动检测循环
}

function grabVideoFrame() {
  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;
  if (!w || !h) return null;
  workCanvas.width = w;
  workCanvas.height = h;
  workCanvas.getContext("2d").drawImage(videoEl, 0, 0, w, h);
  return workCanvas;
}
```

支持能力：暂停 / 关闭、Video Fit（contain / cover）、CSS 缩放 0.5×～3×、顺时针旋转 90°、移动端 `ImageCapture` / `applyConstraints` 手电筒开关。

---

### 3. 文档扫描：边缘高亮 + 透视裁剪

**依赖库**：jscanify（底层依赖 OpenCV.js）

#### 3.1 实时高亮 `highlightPaper`

按设定间隔从摄像头抓帧，调用 jscanify 勾画文档四边形轮廓，并叠加到预览层：

```js
async function runHighlightOnce() {
  const frame = grabVideoFrame();
  if (!frame || !scanner) return;

  const result = scanner.highlightPaper(frame, {
    color: "#1ec8a5",
    thickness: 8
  });
  if (!result) return;

  highlightCanvas.width = result.width;
  highlightCanvas.height = result.height;
  const ctx = highlightCanvas.getContext("2d");
  ctx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);
  ctx.drawImage(result, 0, 0);
  highlightCanvas.classList.add("visible");
}
```

建议：文档放在对比明显的纯色背景上，边缘检测更稳。

#### 3.2 透视矫正裁剪 `extractPaper`

拍摄时可对歪斜文档做透视变换，输出接近 A4 @150dpi 的尺寸（默认 `1240×1754`）；未检测到文档时回退整帧。

```js
function extractFromSource(source, { preserveNativeSize = false } = {}) {
  const w = Number(paperW) || 1240;
  const h = Number(paperH) || 1754;

  // 纠偏模式：先取原生角点，再按原图比例缩放输出
  if (preserveNativeSize) {
    const native = getNativePaperSize(source); // 内部基于 findPaperContour
    if (native?.cornerPoints) {
      return scanner.extractPaper(source, native.width, native.height, native.cornerPoints);
    }
  }
  return scanner.extractPaper(source, w, h);
}

async function captureFrame(forceRaw = false) {
  const frame = grabViewMatchedFrame();
  let out = cloneCanvas(frame);

  if (!forceRaw && (autoExtract || deskew)) {
    const extracted = extractFromSource(frame, { preserveNativeSize: deskew });
    if (extracted) out = extracted; // 成功则用矫正图
  }
  await addShot(out, meta); // 写入底部相册
}
```

本地图片同样可走「高亮检测 / 裁剪提取」，不依赖摄像头。

---

### 4. 条形码 / 二维码识别

**依赖库**：`@zxing/library`；部分浏览器可回退原生 `BarcodeDetector`

识别链路按「原生 → 像素直解码 → decodeFromCanvas → Image 回退」分层尝试，并对灰度 / 放大变体做增强，提高小码与反色码成功率：

```js
function createZXingReader(formatNames) {
  const ZX = window.ZXing;
  const hints = new Map();
  hints.set(ZX.DecodeHintType.TRY_HARDER, true);
  if (formatNames?.length) {
    const formats = formatNames
      .map((n) => ZX.BarcodeFormat[n])
      .filter((f) => f != null);
    hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, formats);
  }
  return new ZX.BrowserMultiFormatReader(hints);
}

async function recognizeFromCanvas(canvas, formatNames) {
  const preferQr = formatNames?.length === 1 && formatNames[0] === "QR_CODE";
  const variants = [canvas, toGrayscaleCanvas(canvas)];

  for (const variant of variants) {
    // 0) 浏览器原生 BarcodeDetector
    const nativeHit = await recognizeWithBarcodeDetector(variant, preferQr);
    if (nativeHit?.text) return nativeHit;

    // 1) HTMLCanvasElementLuminanceSource 直接解码
    const direct = decodeCanvasDirect(variant, formatNames);
    if (direct?.text) return direct;

    // 2) BrowserMultiFormatReader.decodeFromCanvas
    const reader = createZXingReader(formatNames);
    try {
      const result = await reader.decodeFromCanvas(variant);
      const parsed = parseZXingResult(result);
      if (parsed?.text) return parsed;
    } catch { /* continue */ }
  }
  return undefined;
}
```

支持模式：

- 摄像头画面轮询识别 / 上传图优先识别
- 舞台 ROI **框选识别**（仅摄像头）
- 与拍摄策略联动：识别成功可用条码内容作为相册文件名

---

### 5. 浏览器端 OCR（证件 / 发票 / 营业执照）

**依赖库**：`onnxruntime-web` + 自研 `comm/web-ocr-engine.js`（PP-OCRv6 tiny）

OCR 不在首屏加载，开启模块时才动态引入引擎并下载 det / rec 模型：

```js
async function ensureOcrEngine() {
  if (ocrEngine) return ocrEngine;
  ocrEngine = await import("./comm/web-ocr-engine.js");
  return ocrEngine;
}

async function enableOcrModule() {
  const engine = await ensureOcrEngine();
  await engine.loadOcrModels((evt) => {
    // evt.stage: cdn | det | rec
    // evt.progress: 0~100，用于进度条
  });
  ocrReady = true;
}

async function runOcr(type) {
  // 上传图优先于摄像头画面
  const frame = ocrUploadCanvas
    ? cloneCanvas(ocrUploadCanvas)
    : grabViewMatchedFrame();

  const result = await ocrEngine.runOcrOnCanvas(frame, type, (pct, step) => {
    // 识别进度回调
  });
  // result: { imageDataUrl, annotatedDataUrl, resultText, fullText, ... }
}
```

引擎侧关键路径：

| 文件 | 作用 |
|------|------|
| `comm/web-ocr-engine.js` | ORT 会话、检测 / 识别推理流水线 |
| `comm/parse-id-card.js` | 身份证正反面字段解析 |
| `comm/parse-bank-card.js` | 银行卡号解析 |
| `comm/invoice-parse/` | 国内发票结构化 |
| `comm/business-license-parse/` | 营业执照统一社会信用代码等 |

支持类型：通用 OCR、身份证、银行卡、国内发票、营业执照。结果含原图、标注图与结构化文本。

---

### 6. 人脸检测与活体预览

**依赖库**：face-api.js（tinyFaceDetector）+ FLXC ONNX 活体模型 + onnxruntime-web

同样按需加载。舞台勾选「识别人脸」后，会实时框选并叠加置信度 / 活体分数（与拍摄识别策略互斥）：

```js
// comm/web-face-engine.js
export async function loadFaceModels(onStatus) {
  await ensureFaceApi();
  await ensureOrt();
  await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_WEIGHTS);

  // 优先 WebGL，失败回退 WASM
  try {
    livenessSession = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ["webgl"]
    });
  } catch {
    livenessSession = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ["wasm"]
    });
  }
}

// 舞台实时预览：连拍 2 帧做轻量活体
async function runFacePreviewOnce() {
  const snap = cloneCanvas(grabVideoFrame());
  const frames = [snap];
  await sleep(50);
  const frame2 = grabVideoFrame();
  if (frame2) frames.push(cloneCanvas(frame2));

  const result = await faceEngine.analyzeFacesOnCanvas(frames, "liveness");
  faceEngine.paintFacesOnOverlay(
    faceOverlayCanvas,
    result.width,
    result.height,
    result.faces,
    result.liveness
  );
}
```

模块操作区还提供「人脸检测」「活体检测」按钮：摄像头活体默认连拍 4 帧；上传图则复用单图。

---

### 7. 拍摄策略与相册命名

**依赖**：复用上文扫码 / OCR 能力，无额外库

识别策略为单选（条形码 / 二维码 / 身份证 / 银行卡 / 发票 / 营业执照）。开启「识别成功加入相册」后，仅成功才入库，并用识别内容命名：

| 类型 | 文件名来源 |
|------|------------|
| 条形码 / 二维码 | 码值文本 |
| 身份证正面 | 身份证号 |
| 身份证反面 | 签发机关 + 有效期限 |
| 国内发票 | 发票号码 |
| 营业执照 | 统一社会信用代码 |

「识别内容重复」开启时，同内容自动追加 `-1`、`-2`…；关闭则与相册重名时拒绝入库。

自动连拍：开启后点击「拍摄」进入倒计时循环（默认间隔 5 秒，可配 3～60 秒），再点一次停止。

---

### 8. 注意事项

1. 必须使用 **localhost** 或 **HTTPS**，否则摄像头不可用  
2. OCR、人脸模型体积较大，首次开启需等待本地模型加载  
3. 文档扫描效果依赖背景对比度；文档平整、背景纯色时纠偏更稳  
4. 识别策略与舞台「识别人脸」互斥，勿同时依赖两者  
5. 「识别成功加入相册」开启时，识别失败不会写入相册  

---

## 源码

| 资源 | 链接 |
|------|------|
| 在线演示 | [https://archernull.github.io/jscanify-camera/](https://archernull.github.io/jscanify-camera/) |
| 源码目录 | [jscanify-camera](https://github.com/ArcherNull/ArcherNull.github.io/tree/main/jscanify-camera) |
| 主页面 | [`index.html`](https://github.com/ArcherNull/ArcherNull.github.io/blob/main/jscanify-camera/index.html) |
| OCR 引擎 | [`comm/web-ocr-engine.js`](https://github.com/ArcherNull/ArcherNull.github.io/blob/main/jscanify-camera/comm/web-ocr-engine.js) |
| 人脸引擎 | [`comm/web-face-engine.js`](https://github.com/ArcherNull/ArcherNull.github.io/blob/main/jscanify-camera/comm/web-face-engine.js) |
| SDK 说明 | [`sdk/readMe.md`](https://github.com/ArcherNull/ArcherNull.github.io/blob/main/jscanify-camera/sdk/readMe.md) |

克隆与本地运行：

```bash
git clone https://github.com/ArcherNull/ArcherNull.github.io.git
cd ArcherNull.github.io/jscanify-camera
npx serve .
# 浏览器打开 http://localhost:3000
```

---

如果这套纯前端高拍仪方案对你有帮助，欢迎 Star 仓库，也欢迎在评论区交流你在文档扫描 / 证件识别落地中的坑与优化点。
