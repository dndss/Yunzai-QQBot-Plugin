import plugin from "../../../lib/plugins/plugin.js"
import {
  startQRLogin,
  generateTokenString,
  saveBotToken,
} from "../lib/qrlogin.js"

/**
 * #QQbot扫码登录 命令
 *
 * 用户发送 #QQbot扫码登录 → 生成二维码 → 用户用QQ扫码授权 →
 * 自动调用 QQ 官方 API 获取 uin → 生成配置 → 写入配置文件
 *
 * 不限适配器，任何消息通道均可触发（但配置最终写入 QQBot 适配器）
 */
export class QRLoginPlugin extends plugin {
  constructor() {
    super({
      name: "QQBot扫码登录",
      dsc: "使用QQ扫码授权添加机器人，自动获取uin并写入配置",
      event: "message",
      priority: 5000,
      rule: [
        {
          reg: "^#QQbot扫码登录$",
          fnc: "startLogin",
          permission: "master",
        },
      ],
    })

    /** @type {boolean} 防止重复扫码流程 */
    this._running = false
  }

  /**
   * 框架通过 rule.reg 匹配后调用
   * @param {Object} e - 标准事件对象（参见 wiki 第四节）
   */
  async startLogin(e) {
    if (this._running) {
      await e.reply("已有扫码流程正在进行中，请稍后重试")
      return true
    }

    this._running = true
    try {
      await e.reply("正在生成扫码登录二维码，请稍候...")

      const result = await startQRLogin(
        // onQR: 二维码图片就绪（base64 PNG data URL）
        async (qrBase64) => {
          await e.reply([
            "请使用手机 QQ 扫描以下二维码进行授权：",
            segment.image(
              `base64://${qrBase64.replace("data:image/png;base64,", "")}`,
            ),
            "二维码有效期1分钟",
          ])
        },

        // onLog: 日志回调
        (level, msg) => {
          Bot.makeLog?.(level, [`[扫码登录] ${msg}`], "QQBot-Plugin")
        },
      )

      // 扫码成功，生成配置
      const { uin, appid, secret, username } = result
      const tokenString = generateTokenString(uin, appid, secret)

      Bot.makeLog?.(
        "info",
        [`[扫码登录] 生成配置: ${tokenString}`],
        "QQBot-Plugin",
      )

      const saveResult = await saveBotToken(tokenString)

      if (saveResult.added) {
        await e.reply([
          `✅ 扫码登录成功！\n`,
          `机器人：${username} (${uin})\n`,
          `AppID：${appid}\n`,
          `配置已自动保存，重启后生效`,
        ])
      } else {
        await e.reply([
          `✅ 扫码登录成功！\n`,
          `机器人：${username} (${uin})\n`,
          `AppID：${appid}\n`,
          `⚠️ ${saveResult.msg}，请重启后使用`,
        ])
      }
    } catch (err) {
      Bot.makeLog?.(
        "error",
        [`[扫码登录] 失败: ${err.message}`],
        "QQBot-Plugin",
      )
      await e.reply(`❌ 扫码登录失败：${err.message} 重新发送 #QQbot扫码登录 重试`)
    } finally {
      this._running = false
    }

    return true
  }
}
