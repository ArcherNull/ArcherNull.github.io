/** 默认值来自 `.env` 中的 VITE_SDK_APP_ID / VITE_SDK_SECRET_KEY */
export const ROOMKIT_DEFAULTS = {
  sdkAppId: Number(import.meta.env.VITE_SDK_APP_ID || 0),
  secretKey: String(import.meta.env.VITE_SDK_SECRET_KEY || ''),
}

const STORAGE_KEYS = {
  sdkAppId: 'roomkit.sdkAppId',
  secretKey: 'roomkit.secretKey',
  userId: 'roomkit.userId',
  userName: 'roomkit.userName',
} as const

export function loadStoredConfig() {
  // .env 优先；仅当环境变量未配置时回退到 localStorage
  const sdkFromLs = localStorage.getItem(STORAGE_KEYS.sdkAppId)
  const secretFromLs = localStorage.getItem(STORAGE_KEYS.secretKey)
  return {
    sdkAppId: Number(ROOMKIT_DEFAULTS.sdkAppId || sdkFromLs || 0),
    secretKey: String(ROOMKIT_DEFAULTS.secretKey || secretFromLs || ''),
    userId: localStorage.getItem(STORAGE_KEYS.userId) || `user_${Math.random().toString(36).slice(2, 8)}`,
    userName: localStorage.getItem(STORAGE_KEYS.userName) || '',
  }
}

export function saveStoredConfig(cfg: {
  sdkAppId: number
  secretKey: string
  userId: string
  userName: string
}) {
  localStorage.setItem(STORAGE_KEYS.sdkAppId, String(cfg.sdkAppId || ''))
  localStorage.setItem(STORAGE_KEYS.secretKey, cfg.secretKey || '')
  localStorage.setItem(STORAGE_KEYS.userId, cfg.userId || '')
  localStorage.setItem(STORAGE_KEYS.userName, cfg.userName || '')
}

export function randomRoomId() {
  return `room_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
