# 腾讯视立方 TUIRoomKit（meet.html）

本目录为 `meeting/meet.html` 的源码工程，基于官方 `@tencentcloud/roomkit-web-vue3` 接入完整会议 UI（设备检测、音视频、屏幕共享、聊天、成员管理、AI 字幕等）。

## 开发

```bash
cd meeting/roomkit-app
npm install
npm run dev
```

浏览器打开提示的地址中的 `/meet.html`。

## 构建（输出到上级目录）

```bash
npm run build
```

产物：

- `../meet.html`
- `../roomkit-assets/*`

## 配置

在项目根目录创建 `.env`（可参考 `.env.example`）：

```env
VITE_SDK_APP_ID=你的SDKAppID
VITE_SDK_SECRET_KEY=你的SDKSecretKey
```

修改 `.env` 后需重启 `npm run dev`。页面「应用配置」仍可临时覆盖（写入 localStorage）。

分享链接示例：`meet.html?action=join&roomId=room_xxx&password=可选`
