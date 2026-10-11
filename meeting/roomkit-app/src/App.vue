<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import {
  RoomKit,
  genTestUserSig,
  type ExitedPayload,
} from '@tencentcloud/roomkit-web-vue3'
import { loadStoredConfig, randomRoomId, saveStoredConfig } from './config'

const stored = loadStoredConfig()
const form = reactive({
  sdkAppId: stored.sdkAppId ? String(stored.sdkAppId) : '',
  secretKey: stored.secretKey,
  userId: stored.userId,
  userName: stored.userName,
  roomId: '',
  password: '',
  roomName: '',
})

const mode = ref<'create' | 'join'>('create')
const inRoom = ref(false)
const busy = ref(false)
const toast = ref('')
const showConfig = ref(false)
let toastTimer = 0
let roomKit: RoomKit | null = null
let offExited: (() => void) | null = null

const title = computed(() =>
  mode.value === 'create' ? '发起会议' : '加入会议',
)

function showToast(message: string) {
  toast.value = message
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = ''
  }, 2800)
}

function persistForm() {
  saveStoredConfig({
    sdkAppId: Number(form.sdkAppId) || 0,
    secretKey: form.secretKey.trim(),
    userId: form.userId.trim(),
    userName: form.userName.trim(),
  })
}

function ensureCredentials() {
  const sdkAppId = Number(form.sdkAppId)
  const secretKey = form.secretKey.trim()
  const userId = form.userId.trim()
  if (!sdkAppId || !secretKey) {
    throw new Error('请先填写 SDKAppId 与 SecretKey（腾讯云控制台 · 应用管理）')
  }
  if (!userId) {
    throw new Error('请填写用户 ID')
  }
  const { userSig } = genTestUserSig({
    userId,
    sdkAppId,
    secretKey,
  })
  return {
    sdkAppId,
    userId,
    userSig,
    userName: form.userName.trim() || userId,
    avatarUrl: '',
  }
}

function applyShareLink(roomId: string, password?: string) {
  if (!roomKit) return
  const url = new URL(window.location.href)
  url.searchParams.set('roomId', roomId)
  url.searchParams.set('action', 'join')
  if (password) url.searchParams.set('password', password)
  else url.searchParams.delete('password')
  roomKit.setUIConfig({
    language: 'zh-CN',
    theme: { themeStyle: 'light', primaryColor: '#006eff' },
    shareLink: url.toString(),
  })
}

function bindExit(kit: RoomKit) {
  offExited?.()
  offExited = kit.on('exited', (payload: ExitedPayload) => {
    inRoom.value = false
    roomKit = null
    if (payload.reason === 'EnterFailed') {
      showToast('进入会议失败，请检查房间号、密码或应用配置')
    } else if (payload.reason === 'KickedOut') {
      showToast('您已被移出会议')
    } else if (payload.reason === 'KickedOffline') {
      showToast('账号在其他设备登录，当前设备已下线')
    } else if (payload.reason === 'UserSigExpired') {
      showToast('登录凭证已过期，请重新进入')
    }
  })
}

function startQuickMeeting() {
  if (busy.value || inRoom.value) return
  mode.value = 'create'
  form.roomId = randomRoomId()
  void enterMeeting('create')
}

async function enterMeeting(action: 'create' | 'join') {
  if (busy.value || inRoom.value) return
  busy.value = true
  try {
    persistForm()
    const credentials = ensureCredentials()
    let roomId = form.roomId.trim()
    if (action === 'create' && !roomId) {
      roomId = randomRoomId()
      form.roomId = roomId
    }
    if (!roomId) {
      throw new Error('请填写房间 ID')
    }

    await RoomKit.destroyInstance()
    roomKit = RoomKit.getInstance(credentials)
    bindExit(roomKit)
    roomKit.setUIConfig({
      language: 'zh-CN',
      theme: { themeStyle: 'light', primaryColor: '#006eff' },
    })

    const password = form.password.trim() || undefined
    const container = { appendTo: '#roomkit-container' }

    if (action === 'create') {
      await roomKit.createAndJoin({
        roomId,
        password,
        roomName: form.roomName.trim() || `${credentials.userName} 的会议`,
        container,
      })
    } else {
      await roomKit.join({
        roomId,
        password,
        container,
      })
    }

    applyShareLink(roomId, password)
    inRoom.value = true
    showToast(action === 'create' ? '会议已创建' : '已加入会议')
  } catch (error) {
    console.error(error)
    inRoom.value = false
    showToast(error instanceof Error ? error.message : '进入会议失败')
    try {
      await RoomKit.destroyInstance()
    } catch {
      /* ignore */
    }
    roomKit = null
  } finally {
    busy.value = false
  }
}

function applyUrlParams() {
  const params = new URLSearchParams(window.location.search)
  const roomId = params.get('roomId') || params.get('room') || ''
  const password = params.get('password') || ''
  const action = params.get('action') || ''
  const userId = params.get('userId') || ''
  const userName = params.get('userName') || ''
  if (roomId) form.roomId = roomId
  if (password) form.password = password
  if (userId) form.userId = userId
  if (userName) form.userName = userName
  if (action === 'join' || roomId) mode.value = 'join'
  if (action === 'create') mode.value = 'create'
}

onMounted(() => {
  applyUrlParams()
  const params = new URLSearchParams(window.location.search)
  if (params.get('autostart') === '1' && form.roomId && form.sdkAppId && form.secretKey) {
    void enterMeeting(mode.value)
  }
})

onUnmounted(() => {
  offExited?.()
  void RoomKit.destroyInstance()
})
</script>

<template>
  <div class="shell" :class="{ 'in-room': inRoom }">
    <header class="topbar" v-show="!inRoom">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"></span>
        <div>
          <strong>腾讯视立方</strong>
          <span>TUIRoomKit · 多人音视频会议</span>
        </div>
      </div>
      <nav class="links">
        <a href="https://cloud.tencent.com/document/product/647/81962" target="_blank" rel="noreferrer">快速接入</a>
        <a href="https://cloud.tencent.com/document/product/647/78740" target="_blank" rel="noreferrer">API 概览</a>
        <button type="button" class="ghost" @click="showConfig = !showConfig">
          {{ showConfig ? '收起配置' : '应用配置' }}
        </button>
      </nav>
    </header>

    <main class="detail">
      <section v-show="!inRoom" class="entry-panel">
        <div class="hero-copy">
          <p class="eyebrow">多人音视频会议体验</p>
          <h1>RoomKit 完整会议能力</h1>
          <p class="lead">
            设备检测、创建/加入房间、屏幕共享、聊天、成员管理、AI 字幕、云端录制等会中能力由腾讯视立方 TUIRoomKit 原生提供。
          </p>
          <ul class="feature-list">
            <li>音视频通话设备检查</li>
            <li>新建 / 加入会议房间</li>
            <li>共享屏幕 · 邀请参会 · 聊天室</li>
            <li>AI 实时字幕 · 成员管理</li>
          </ul>
        </div>

        <div class="card">
          <div class="tabs">
            <button type="button" :class="{ active: mode === 'create' }" @click="mode = 'create'">发起会议</button>
            <button type="button" :class="{ active: mode === 'join' }" @click="mode = 'join'">加入会议</button>
          </div>
          <h2>{{ title }}</h2>

          <div v-show="showConfig" class="config-block">
            <label>
              <span>SDKAppId</span>
              <input v-model="form.sdkAppId" inputmode="numeric" placeholder="腾讯云控制台应用 SDKAppId" />
            </label>
            <label>
              <span>SDKSecretKey</span>
              <input v-model="form.secretKey" type="password" placeholder="仅本地 Demo，正式环境请服务端签发 UserSig" />
            </label>
            <p class="hint">SecretKey 仅适合本地调试；生产环境必须由服务端生成 UserSig。</p>
          </div>

          <label>
            <span>用户 ID</span>
            <input v-model="form.userId" placeholder="同一应用内唯一，多端请勿复用" />
          </label>
          <label>
            <span>显示昵称</span>
            <input v-model="form.userName" placeholder="会中展示名称，可选" />
          </label>
          <label>
            <span>房间 ID</span>
            <input
              v-model="form.roomId"
              :placeholder="mode === 'create' ? '可留空，将自动生成 room_xxx' : '例如 room_123456'"
            />
          </label>
          <label v-if="mode === 'create'">
            <span>会议名称</span>
            <input v-model="form.roomName" placeholder="可选，默认「昵称的会议」" />
          </label>
          <label>
            <span>会议密码</span>
            <input v-model="form.password" placeholder="可选；设置后入会需校验" />
          </label>

          <div class="actions" :class="{ 'with-quick': mode === 'create' }">
            <button
              type="button"
              class="primary"
              :disabled="busy"
              @click="enterMeeting(mode)"
            >
              {{ busy ? '进入中…' : mode === 'create' ? '创建并进入' : '加入会议' }}
            </button>
            <button type="button" class="secondary" @click="form.roomId = randomRoomId()">生成房间号</button>
            <button
              v-if="mode === 'create'"
              type="button"
              class="secondary quick"
              :disabled="busy"
              @click="startQuickMeeting"
            >
              快速会议
            </button>
          </div>
        </div>
      </section>

      <!-- 对齐体验中心 .detail-content.roomkit 容器：RoomKit 完整 UI 挂载于此 -->
      <div
        id="roomkit-container"
        class="detail-content roomkit"
        :class="{ active: inRoom }"
        aria-live="polite"
      ></div>
    </main>

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background:
    radial-gradient(900px 420px at 8% -10%, rgba(0, 110, 255, 0.16), transparent 55%),
    radial-gradient(700px 380px at 92% 0%, rgba(0, 82, 217, 0.1), transparent 50%),
    linear-gradient(180deg, #f8faff 0%, #eef2f8 100%);
}

.shell.in-room {
  background: #0b0d12;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 64px;
  padding: 0 28px;
  background: rgba(255, 255, 255, 0.86);
  border-bottom: 1px solid var(--rk-line);
  backdrop-filter: blur(12px);
  z-index: 2;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-mark {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background:
    linear-gradient(145deg, #3d8bff, var(--rk-blue-deep));
  box-shadow: 0 8px 18px rgba(0, 110, 255, 0.28);
  position: relative;
}

.brand-mark::after {
  content: "";
  position: absolute;
  inset: 10px 8px 10px 12px;
  border: 2px solid #fff;
  border-radius: 6px 10px 6px 6px;
}

.brand strong {
  display: block;
  font-family: var(--font-display);
  font-size: 17px;
  letter-spacing: 0.02em;
}

.brand span {
  display: block;
  color: var(--rk-muted);
  font-size: 12px;
  margin-top: 2px;
}

.links {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.links a,
.ghost {
  padding: 8px 12px;
  border-radius: 8px;
  color: var(--rk-muted);
  text-decoration: none;
  font-size: 13px;
  transition: background 0.2s, color 0.2s;
}

.links a:hover,
.ghost:hover {
  background: var(--rk-soft);
  color: var(--rk-blue-deep);
}

.detail {
  position: relative;
  flex: 1;
  min-height: 0;
}

.entry-panel {
  height: 100%;
  display: grid;
  grid-template-columns: minmax(280px, 1.05fr) minmax(320px, 420px);
  gap: 36px;
  align-items: center;
  padding: 32px 48px 40px;
  max-width: 1180px;
  margin: 0 auto;
  animation: rise 0.55s ease both;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.eyebrow {
  color: var(--rk-blue);
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin: 0 0 10px;
}

.hero-copy h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(28px, 4vw, 40px);
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.lead {
  margin: 14px 0 0;
  color: var(--rk-muted);
  line-height: 1.7;
  font-size: 15px;
  max-width: 36em;
}

.feature-list {
  margin: 22px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 10px;
}

.feature-list li {
  position: relative;
  padding-left: 22px;
  color: #334155;
  font-size: 14px;
}

.feature-list li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.45em;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--rk-blue);
  box-shadow: 0 0 0 4px rgba(0, 110, 255, 0.12);
}

.card {
  background: var(--rk-panel);
  border: 1px solid rgba(231, 234, 240, 0.9);
  border-radius: 18px;
  box-shadow: var(--rk-shadow);
  padding: 22px 22px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 4px;
  background: var(--rk-soft);
  border-radius: 12px;
}

.tabs button {
  padding: 10px 12px;
  border-radius: 9px;
  color: var(--rk-muted);
  font-weight: 600;
  font-size: 14px;
}

.tabs button.active {
  background: #fff;
  color: var(--rk-blue-deep);
  box-shadow: 0 2px 8px rgba(15, 34, 67, 0.08);
}

.card h2 {
  margin: 4px 0 2px;
  font-size: 18px;
}

.config-block {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  background: #f3f7ff;
  border: 1px dashed rgba(0, 110, 255, 0.28);
}

label {
  display: grid;
  gap: 6px;
}

label span {
  font-size: 12px;
  color: var(--rk-muted);
  font-weight: 600;
}

.hint {
  margin: 0;
  font-size: 12px;
  color: #7b8798;
  line-height: 1.5;
}

.actions {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 10px;
  margin-top: 4px;
}

.actions.with-quick {
  grid-template-columns: 1.3fr 1fr 1fr;
}

.primary,
.secondary {
  min-height: 44px;
  border-radius: 11px;
  font-weight: 700;
  font-size: 14px;
  transition: transform 0.15s, box-shadow 0.2s, background 0.2s, opacity 0.2s;
}

.primary {
  color: #fff;
  background: linear-gradient(135deg, #3d8bff, var(--rk-blue-deep));
  box-shadow: 0 10px 22px rgba(0, 110, 255, 0.28);
}

.primary:hover:not(:disabled) {
  transform: translateY(-1px);
}

.primary:disabled {
  opacity: 0.65;
  cursor: wait;
}

.secondary {
  color: var(--rk-blue-deep);
  background: #edf4ff;
}

.secondary:hover {
  background: #e2eeff;
}

.secondary.quick {
  color: #fff;
  background: linear-gradient(135deg, #1bbf83, #0d9f6e);
}

.secondary.quick:hover:not(:disabled) {
  background: linear-gradient(135deg, #17b079, #0b8f63);
}

.secondary.quick:disabled {
  opacity: 0.65;
  cursor: wait;
}

.detail-content.roomkit {
  position: absolute;
  inset: 0;
  display: none;
  background: #111;
  z-index: 5;
}

.detail-content.roomkit.active {
  display: block;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  z-index: 40;
  max-width: min(92vw, 420px);
  padding: 12px 18px;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.92);
  color: #fff;
  font-size: 13px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
  animation: rise 0.25s ease both;
}

@media (max-width: 900px) {
  .entry-panel {
    grid-template-columns: 1fr;
    padding: 20px 16px 28px;
    align-content: start;
    overflow: auto;
  }

  .topbar {
    padding: 12px 16px;
    align-items: flex-start;
    flex-direction: column;
  }

  .actions {
    grid-template-columns: 1fr;
  }
}
</style>
