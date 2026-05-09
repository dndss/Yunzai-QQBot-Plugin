import makeConfig from "../../../lib/plugins/config.js"
const { config } = await makeConfig(
  "QQBot",
  {
    tips: "",

    toBotUpload: true,
    hideGuildRecall: false,
    imageLength: 3,

    bot: {
      sandbox: false,
      maxRetry: Infinity,
      timeout: 30000,
    },
    token: [],
  },
  {
    tips: [
      "欢迎使用 TRSS-Yunzai QQBot Plugin ! 作者：时雨🌌星空",
      "参考：https://github.com/TimeRainStarSky/Yunzai-QQBot-Plugin",
    ],
  },
)
export { config }