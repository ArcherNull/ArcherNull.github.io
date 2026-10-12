const MEET_BASE = 'https://archernull.github.io/meeting/meet.html'
const STORAGE_KEY = 'mini.meeting.joinForm'

function randomUserId() {
  return `user_${Math.random().toString(36).slice(2, 8)}`
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim())
}

/** 将表单中的 userId / userName / password / action 合并进会议链接 */
function mergeJoinParams(url, form) {
  const raw = String(url || '').trim()
  if (!raw) return ''

  let parsed
  try {
    parsed = new URL(raw)
  } catch (e) {
    return raw
  }

  const roomId = String(form.roomId || '').trim()
  const userId = String(form.userId || '').trim()
  const userName = String(form.userName || '').trim()
  const password = String(form.password || '').trim()

  if (!parsed.searchParams.get('roomId') && roomId) {
    parsed.searchParams.set('roomId', roomId)
  }
  parsed.searchParams.set('action', parsed.searchParams.get('action') || 'join')
  if (userId) parsed.searchParams.set('userId', userId)
  if (userName) parsed.searchParams.set('userName', userName)
  if (password) parsed.searchParams.set('password', password)
  else parsed.searchParams.delete('password')

  parsed.searchParams.set('autostart', '1')
  return parsed.toString()
}

function buildMeetUrlFromForm(form) {
  const roomId = String(form.roomId || '').trim()
  if (!roomId) return ''
  const url = new URL(MEET_BASE)
  url.searchParams.set('roomId', roomId)
  url.searchParams.set('action', 'join')
  return mergeJoinParams(url.toString(), form)
}

Component({
  data: {
    hasLink: false,
    form: {
      userId: '',
      userName: '',
      roomId: '',
      password: '',
      meetUrl: '',
    },
  },

  lifetimes: {
    attached() {
      const cached = wx.getStorageSync(STORAGE_KEY) || {}
      const form = {
        userId: cached.userId || randomUserId(),
        userName: cached.userName || '',
        roomId: cached.roomId || '',
        password: cached.password || '',
        meetUrl: cached.meetUrl || '',
      }
      this.setData({
        form,
        hasLink: isHttpUrl(form.meetUrl),
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
      if (key === 'meetUrl') {
        patch.hasLink = isHttpUrl(value)
      }
      this.setData(patch)
    },

    openWebview(url) {
      if (!url) {
        wx.showToast({ title: '会议链接无效', icon: 'none' })
        return
      }
      this.persistForm()
      wx.navigateTo({
        url: `/pages/meeting/meeting?url=${encodeURIComponent(url)}`,
      })
    },

    onJoinMeeting() {
      const { form } = this.data
      const link = String(form.meetUrl || '').trim()

      if (link) {
        if (!isHttpUrl(link)) {
          wx.showToast({ title: '请填写完整的 http(s) 链接', icon: 'none' })
          return
        }
        this.openWebview(mergeJoinParams(link, form))
        return
      }

      if (!String(form.roomId || '').trim()) {
        wx.showToast({ title: '请填写房间 ID 或会议链接', icon: 'none' })
        return
      }
      if (!String(form.userId || '').trim()) {
        wx.showToast({ title: '请填写用户 ID', icon: 'none' })
        return
      }
      this.openWebview(buildMeetUrlFromForm(form))
    },

    onPasteLink() {
      wx.getClipboardData({
        success: (res) => {
          const text = String(res.data || '').trim()
          if (!isHttpUrl(text)) {
            wx.showToast({ title: '剪贴板不是有效链接', icon: 'none' })
            return
          }
          const patch = { 'form.meetUrl': text }
          try {
            const u = new URL(text)
            const roomId = u.searchParams.get('roomId') || u.searchParams.get('room')
            const password = u.searchParams.get('password')
            const userId = u.searchParams.get('userId')
            const userName = u.searchParams.get('userName')
            if (roomId) patch['form.roomId'] = roomId
            if (password) patch['form.password'] = password
            if (userId) patch['form.userId'] = userId
            if (userName) patch['form.userName'] = userName
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
      this.setData({ 'form.meetUrl': '', hasLink: false })
    },
  },
})
