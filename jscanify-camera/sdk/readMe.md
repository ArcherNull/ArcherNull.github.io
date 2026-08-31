# SDK 静态依赖（离线 / 本地引入）

本目录存放页面所需第三方库，**不再依赖 CDN**。

| 包 | 路径 | 用途 |
|---|---|---|
| OpenCV.js 4.7.0 | `opencv@4.7.0/opencv.js` | 图像处理底层 |
| jscanify 1.4.0 | `jscanify@1.4.0/src/jscanify.min.js` | 文档边缘检测 / 透视矫正 |
| @zxing/library 0.21.3 | `@zxing/library@0.21.3/umd/index.min.js` | 条形码 / 二维码 |
| onnxruntime-web 1.27.0 | `onnxruntime-web@1.27.0/dist/` | OCR / 人脸活体推理 |
| face-api.js 0.22.2 | `face-api.js@0.22.2/` | 人脸检测（含 tinyFaceDetector weights） |

`index.html` 头部直接引用 OpenCV / jscanify / zxing；OCR 与人脸模块在 `comm/web-ocr-engine.js`、`comm/web-face-engine.js` 中按需加载 ORT / face-api。
