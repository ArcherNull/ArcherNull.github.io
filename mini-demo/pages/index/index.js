Component({
  methods: {
    onGoCall() {
      wx.navigateTo({ url: '/pages/call/call' })
    },

    onGoMeeting() {
      wx.navigateTo({ url: '/pages/join/join' })
    },
  },
})
