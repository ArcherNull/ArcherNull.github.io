const CALL_BASE = 'https://archernull.github.io/meeting/index.html'
const STORAGE_KEY = 'mini.call.joinForm'
const DEFAULT_SDK_APP_ID = '1600163950'

function randomUserId() {
  return `user_${Math.random().toString(36).slice(2, 8)}`
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim())
}

/** 将表单中的 userId / displayName / room 合并进通话链接 */
function mergeCallParams(url, form) {
  const raw = String(url || '').trim()
  if (!raw) return ''

  let parsed
  try {
    parsed = new URL(raw)
  } catch (e) {
    return raw
  }

  const roomId = String(form.roomId || '').trim().replace(/\D/g, '')
  const userId = String(form.userId || '').trim()
  const displayName = String(form.displayName || '').trim()

  if (!parsed.searchParams.get('room') && !parsed.searchParams.get('roomId') && roomId) {
    parsed.searchParams.set('room', roomId)
  }
  if (!parsed.searchParams.get('sdkAppId') && !parsed.searchParams.get('sdk')) {
    parsed.searchParams.set('sdkAppId', DEFAULT_SDK_APP_ID)
  }
  if (userId) parsed.searchParams.set('userId', userId)
  if (displayName) {
    parsed.searchParams.set('displayName', displayName)
  } else {
    parsed.searchParams.delete('displayName')
  }

  parsed.searchParams.set('autostart', '1')
  return parsed.toString()
}

function buildCallUrlFromForm(form) {
  const roomId = String(form.roomId || '').trim().replace(/\D/g, '')
  if (!roomId) return ''
  const url = new URL(CALL_BASE)
  url.searchParams.set('room', roomId)
  url.searchParams.set('sdkAppId', DEFAULT_SDK_APP_ID)
  return mergeCallParams(url.toString(), form)
}

Component({
  data: {
    hasLink: false,
    form: {
      userId: '',
      displayName: '',
      roomId: '',
      inviteUrl: '',
    },
  },

  lifetimes: {
    attached() {
      const cached = wx.getStorageSync(STORAGE_KEY) || {}
      const form = {
        userId: cached.userId || randomUserId(),
        displayName: cached.displayName || '',
        roomId: cached.roomId || '',
        inviteUrl: cached.inviteUrl || '',
      }
      this.setData({
        form,
        hasLink: isHttpUrl(form.inviteUrl),
      })
    },
  },

  methods: {
    persistForm() {
      wx.setStorageSync(STORAGE_KEY, this.data.form)
    },

    onFieldInput(e) {
      const key = e.currentTarget.dataset.key
      if (!key) return
      const value = e.detail.value
      const patch = { [`form.${key}`]: value }
      if (key === 'inviteUrl') {
        patch.hasLink = isHttpUrl(value)
      }
      this.setData(patch)
    },

    openWebview(url) {
      if (!url) {
        wx.showToast({ title: '通话链接无效', icon: 'none' })
        return
      }
      this.persistForm()
      wx.navigateTo({
        url: `/pages/meeting/meeting?url=${encodeURIComponent(url)}&title=${encodeURIComponent('通话中')}`,
      })
    },

    onEnterCall() {
      const { form } = this.data
      const link = String(form.inviteUrl || '').trim()

      if (link) {
        if (!isHttpUrl(link)) {
          wx.showToast({ title: '请填写完整的 http(s) 链接', icon: 'none' })
          return
        }
        if (!String(form.userId || '').trim()) {
          wx.showToast({ title: '请填写用户 ID', icon: 'none' })
          return
        }
        this.openWebview(mergeCallParams(link, form))
        return
      }

      if (!String(form.roomId || '').trim().replace(/\D/g, '')) {
        wx.showToast({ title: '请填写房间 ID 或邀请链接', icon: 'none' })
        return
      }
      if (!String(form.userId || '').trim()) {
        wx.showToast({ title: '请填写用户 ID', icon: 'none' })
        return
      }
      this.openWebview(buildCallUrlFromForm(form))
    },

    onPasteLink() {
      wx.getClipboardData({
        success: (res) => {
          const text = String(res.data || '').trim()
          if (!isHttpUrl(text)) {
            wx.showToast({ title: '剪贴板不是有效链接', icon: 'none' })
            return
          }
          const patch = { 'form.inviteUrl': text }
          try {
            const u = new URL(text)
            const roomId = u.searchParams.get('room') || u.searchParams.get('roomId')
            const userId = u.searchParams.get('userId')
            const displayName =
              u.searchParams.get('displayName') ||
              u.searchParams.get('userName') ||
              u.searchParams.get('name')
            if (roomId) patch['form.roomId'] = String(roomId).replace(/\D/g, '')
            // 邀请链接通常不带被邀方 userId；有则回填，无则保留本机已填值
            if (userId) patch['form.userId'] = userId
            if (displayName) patch['form.displayName'] = displayName
          } catch (e) {
            /* ignore parse error */
          }
          patch.hasLink = true
          this.setData(patch)
          wx.showToast({ title: '已粘贴链接', icon: 'success' })
        },
      })
    },

    onClearLink() {
      this.setData({ 'form.inviteUrl': '', hasLink: false })
    },
  },
})
