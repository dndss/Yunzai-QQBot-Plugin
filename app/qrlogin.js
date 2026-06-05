import {
  startQRLogin,
  generateTokenString,
  saveBotToken,
} from "../lib/qrlogin.js"

/**
 * #QQbot扫码登录 命令处理
 *
 * 用户发送 #QQbot扫码登录 → 生成二维码 → 用户扫码 → 自动获取 uin → 保存配置
 *
 * 不限适配器，任何消息通道都可以触发（但最终配置写入 QQBot 适配器）
 */
async function handleQRLogin (data) {
  const text = String(data.raw_message || "").trim()
  if (text !== "#QQbot扫码登录") return

  // 防止重复扫码流程
  if (handleQRLogin._running) {
    await data.reply("已有扫码流程正在进行中，请稍后重试")
    return
  }

  handleQRLogin._running = true
  const cleanup = () => {
    handleQRLogin._running = false
  }

  try {
    await data.reply("正在生成扫码登录二维码，请稍候...")

    const result = await startQRLogin(
      // onQR: 二维码图片就绪（base64 PNG data URL）
      async (qrBase64) => {
        await data.reply([
          "请使用手机 QQ 扫描以下二维码进行授权：",
          segment.image(
            `base64://${qrBase64.replace("data:image/png;base64,", "")}`,
          ),
          "二维码过期后将自动刷新",
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
      await data.reply([
        `✅ 扫码登录成功！\n`,
        `机器人：${username} (${uin})\n`,
        `AppID：${appid}\n`,
        `配置已自动保存，重启后生效`,
      ])
    } else {
      await data.reply([
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
    await data.reply(`❌ 扫码登录失败：${err.message}`)
  } finally {
    cleanup()
  }
}

// 监听消息事件（不限适配器，任何通道均可触发扫码登录）
Bot.on("message.private.friend", handleQRLogin)
Bot.on("message.group.normal", handleQRLogin)

Bot.makeLog?.("info", ["[扫码登录] 模块加载完成，命令：#QQbot扫码登录"])
