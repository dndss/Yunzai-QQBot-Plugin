import { startQrConnect } from "@tencent-connect/qqbot-connector"
import QRCode from "qrcode"
import { config, configSave } from "./config.js"

/**
 * 扫码登录核心逻辑
 *
 * 使用 @tencent-connect/qqbot-connector 扫码获取 appid + secret，
 * 然后调用 QQ 官方 API：
 *   1. POST https://bots.qq.com/app/getAppAccessToken   → access_token
 *   2. GET  https://api.sgroup.qq.com/users/@me         → 用户信息
 *   3. 从 share_url 中解析 robot_uin
 *
 * @param {Function} onQR   - 二维码就绪回调 (base64PNG: string) => void
 * @param {Function} onLog  - 日志回调 (level: string, msg: string) => void
 * @returns {Promise<{uin: string, appid: string, secret: string, username: string}>}
 */
export async function startQRLogin (onQR, onLog) {
  onLog("info", "正在启动扫码流程...")

  return new Promise((resolve, reject) => {
    const stop = startQrConnect(
      {
        onSuccess: async (credentials) => {
          onLog("info", "扫码授权成功，正在获取机器人信息...")
          try {
            const { appId, appSecret } = credentials[0]
            onLog("info", `获取到 AppID: ${appId}`)

            // Step 1: 获取 access_token
            onLog("info", "正在获取 Access Token...")
            const tokenResult = await getAccessToken(appId, appSecret)
            onLog("info", "Access Token 获取成功")

            // Step 2: 获取机器人用户信息
            onLog("info", "正在获取机器人信息...")
            const userInfo = await getBotUserInfo(tokenResult.access_token)
            onLog("info", `机器人名称: ${userInfo.username}`)

            // Step 3: 从 share_url 解析 robot_uin
            if (!userInfo.share_url) {
              throw new Error("share_url 缺失，无法解析机器人 QQ 号")
            }
            const uin = parseRobotUin(userInfo.share_url)
            onLog("info", `机器人 QQ 号: ${uin}`)

            resolve({
              uin,
              appid: appId,
              secret: appSecret,
              username: userInfo.username,
            })
          } catch (err) {
            reject(err)
          }
        },

        onFailure: (err) => {
          onLog("error", `扫码失败: ${err.message}`)
          reject(err)
        },

        onQrDisplayed: async (url) => {
          onLog("info", "二维码已生成，请使用手机 QQ 扫描")
          try {
            const qrBase64 = await QRCode.toDataURL(url, {
              errorCorrectionLevel: "M",
              margin: 2,
              width: 400,
            })
            onQR(qrBase64)
          } catch (err) {
            onLog("error", `二维码图片生成失败: ${err.message}`)
          }
        },

        onQrExpired: () => {
          onLog("warn", "二维码已过期，正在自动刷新...")
        },
      },
      {
        displayQrCodeToConsole: true, // 同时打印到控制台，方便无 GUI 环境
      },
    )
  })
}

/**
 * 获取 QQ 机器人 Access Token
 * POST https://bots.qq.com/app/getAppAccessToken
 *
 * @param {string} appId
 * @param {string} clientSecret
 * @returns {Promise<{access_token: string}>}
 */
async function getAccessToken (appId, clientSecret) {
  let res, data
  try {
    res = await fetch("https://bots.qq.com/app/getAppAccessToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, clientSecret }),
    })
  } catch (err) {
    throw new Error(`请求 Access Token 网络错误: ${err.message}`)
  }

  if (!res.ok) {
    throw new Error(
      `获取 Access Token 失败: HTTP ${res.status} ${res.statusText}`,
    )
  }

  try {
    data = await res.json()
  } catch (err) {
    throw new Error(`解析 Access Token 响应失败: ${err.message}`)
  }

  if (!data.access_token) {
    throw new Error(
      `获取 Access Token 失败: ${JSON.stringify(data)}`,
    )
  }

  return data
}

/**
 * 获取机器人用户信息
 * GET https://api.sgroup.qq.com/users/@me
 *
 * @param {string} accessToken
 * @returns {Promise<{id: string, username: string, avatar: string, share_url: string}>}
 */
async function getBotUserInfo (accessToken) {
  let res, data
  try {
    res = await fetch("https://api.sgroup.qq.com/users/@me", {
      headers: { Authorization: `QQBot ${accessToken}` },
    })
  } catch (err) {
    throw new Error(`请求用户信息网络错误: ${err.message}`)
  }

  if (!res.ok) {
    throw new Error(
      `获取用户信息失败: HTTP ${res.status} ${res.statusText}`,
    )
  }

  try {
    data = await res.json()
  } catch (err) {
    throw new Error(`解析用户信息响应失败: ${err.message}`)
  }

  if (!data.id) {
    throw new Error(
      `获取用户信息失败: ${JSON.stringify(data)}`,
    )
  }

  return data
}

/**
 * 从 share_url 中解析 robot_uin
 * 示例：https://qun.qq.com/qunpro/robot/qunshare?robot_uin=4017330985&...
 *
 * @param {string} shareUrl
 * @returns {string} 机器人 QQ 号
 */
function parseRobotUin (shareUrl) {
  if (!shareUrl || typeof shareUrl !== "string") {
    throw new Error(`share_url 缺失或无效: ${JSON.stringify(shareUrl)}`)
  }

  const match = shareUrl.match(/robot_uin=(\d+)/)
  if (!match || !match[1]) {
    throw new Error(`无法从 share_url 解析 robot_uin: ${shareUrl}`)
  }

  return match[1]
}

/**
 * 生成配置字符串
 * 格式：机器人QQ号:appid:token:secret:群私聊事件开关:频道事件开关
 *
 * 说明：
 *   - 第 1 项：机器人 QQ 号（uin）
 *   - 第 2 项：appid
 *   - 第 3 项：token（历史遗留字段，当前适配器不使用，直接复制 secret）
 *   - 第 4 项：secret
 *   - 第 5 项：群聊/私聊事件开关（默认 1）
 *   - 第 6 项：频道事件开关（默认 0）
 *
 * @param {string} uin    机器人 QQ 号
 * @param {string} appid  AppID
 * @param {string} secret AppSecret
 * @returns {string}
 */
export function generateTokenString (uin, appid, secret) {
  return `${uin}:${appid}:${secret}:${secret}:1:0`
}

/**
 * 保存 token 到配置文件
 *
 * @param {string} tokenString
 * @returns {Promise<{added: boolean, msg: string}>}
 */
export async function saveBotToken (tokenString) {
  if (config.token.includes(tokenString)) {
    return { added: false, msg: "该机器人已存在配置中" }
  }

  config.token.push(tokenString)
  await configSave()
  return { added: true, msg: "配置已保存" }
}
