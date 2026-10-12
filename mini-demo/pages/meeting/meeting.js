Page({
  data: {
    src: '',
  },

  onLoad(query) {
    let src = ''
    let title = '会议中'
    if (query.title) {
      try {
        title = decodeURIComponent(query.title)
      } catch (e) {
        title = query.title
      }
    }
    if (query.url) {
      try {
        src = decodeURIComponent(query.url)
      } catch (e) {
        src = query.url
      }
      // 1 对 1 通话页用 meeting/index.html
      if (/\/meeting\/index\.html/i.test(src) && !query.title) {
        title = '通话中'
      }
    } else if (query.roomId) {
      const roomId = decodeURIComponent(query.roomId)
      const action = query.action ? decodeURIComponent(query.action) : 'join'
      src = `https://archernull.github.io/meeting/meet.html?roomId=${encodeURIComponent(roomId)}&action=${encodeURIComponent(action)}`
    }

    this.setData({ src })

    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: '#000000',
    })
    wx.setNavigationBarTitle({ title })
  },

  onMessage() {
    // H5 可通过 wx.miniProgram.postMessage 回传数据
  },

  onLoadWeb() {
    console.log('[meeting] web-view loaded', this.data.src)
  },

  onErrorWeb(e) {
    console.error('[meeting] web-view error', e)
    wx.showModal({
      title: '无法打开会议页',
      content: '请确认已在小程序后台配置业务域名 archernull.github.io，开发阶段可在开发者工具中勾选「不校验合法域名」。',
      showCancel: false,
    })
  },

  onBack() {
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/pages/index/index' }),
    })
  },
})
