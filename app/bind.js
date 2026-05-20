import crypto from "node:crypto"
import {
  getAppid,
  isQQUin,
  isGuildUserId,
  saveMapping,
} from "../lib/uinMap.js"

async function avatarMd5 (url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "curl/8.0.0",
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  })
  if (!res.ok) throw new Error(`头像获取失败：${res.status} ${res.statusText} ${url}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  if (!buffer.length) return false
  const md5 = crypto.createHash("md5").update(buffer).digest("hex")
  Bot.makeLog?.("debug", ["QQBot 头像MD5", url, md5, buffer.length])
  return md5
}

async function verifyAvatar (appid, openid, uin) {
  const qqbotAvatar = `https://thirdqq.qlogo.cn/qqapp/${appid}/${openid}/640`
  const qqAvatar = `https://q.qlogo.cn/g?b=qq&nk=${uin}&s=640`
  const [md5A, md5B] = await Promise.all([avatarMd5(qqbotAvatar), avatarMd5(qqAvatar)])
  return !!md5A && md5A === md5B
}

/**
 * 绑定命令处理（独立 app，通过 Bot.em 事件驱动）
 *
 *   #QQ绑定        → 显示帮助 + 输入按钮（点击自动填入 #QQ绑定 ）
 *   #QQ绑定<QQ号>  → 头像 MD5 校验 → 双向映射 (Redis + JSON)
 *   #QQ解绑        → TODO
 */
async function handleBindMessage (data) {
  const targetIds = ['QQBot']
  if (!targetIds.includes(data.bot?.adapter?.id)) return

  const rawOpenid = data._raw_user_id || data.sender?.user_id
  if (!rawOpenid || isGuildUserId(rawOpenid)) return

  const appid = getAppid(data.bot || data.self_id)
  const text = String(data.raw_message || "").trim()

  // --- #QQ绑定<QQ号>：直接校验绑定 ---
  const match = text.match(/^(?:#QQ绑定)\s*(\d{5,12})\s*$/)
  if (match) {
    const uin = match[1]
    await data.reply("正在校验...")
    try {
      const ok = await verifyAvatar(appid, rawOpenid, uin)
      if (!ok) {
        await data.reply("绑定失败 和 真实QQ不符合")
        return
      }
      await saveMapping(appid, rawOpenid, uin)
      await data.reply(`绑定成功：${uin}`)
    } catch (err) {
      Bot.makeLog?.("error", ["QQBot 绑定校验失败", appid, rawOpenid, uin, err], data.self_id)
      await data.reply("绑定失败 请稍后重试。")
    }
    return
  }

  // --- #QQ绑定：显示帮助 ---
  if (text === "#QQ绑定") {
    await data.reply([
      "请发送 #QQ绑定+你的QQ号 进行绑定",
      segment.button([
        { text: "输入QQ号绑定", input: "#QQ绑定 ", send: false },
      ]),
    ])
    return
  }

  // --- #QQ解绑 ---
  if (text === "#QQ解绑") {
    // TODO: 解绑逻辑
    await data.reply("解绑功能开发中")
  }
}

// 监听 QQBot 好友消息 + 群消息（client.js → Bot.em 事件）
Bot.on("message.private.friend", handleBindMessage)
Bot.on("message.group.normal", handleBindMessage)
