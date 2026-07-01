import crypto from "node:crypto"
import {
  getAppid,
  isQQUin,
  isGuildUserId,
  saveMapping,
} from "../lib/uinMap.js"
import cfg from "../../../lib/config/config.js"

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

function isMaster (data) {
  return !!(data.user_id && cfg.master[data.self_id]?.includes(String(data.user_id)))
}

function getCommandText (data) {
  const text = data.message
    ?.filter(item => item.type === "text")
    .map(item => item.text || "")
    .join("")
    .trim()
  return text || String(data.raw_message || "").trim()
}

function getMentionTargets (data) {
  const botIds = new Set([
    data.self_id,
    data.bot?.uin,
    data.bot?.info?.id,
  ].filter(Boolean).map(String))
  const targets = new Map()

  for (const item of data.message || []) {
    if (item.type !== "at" || item.is_you) continue
    const openid = String(item._raw_user_id || item.user_id || item.qq || "")
    if (!openid || openid === "all" || isGuildUserId(openid) || botIds.has(openid)) continue
    targets.set(openid, {
      openid,
      name: item.username || "",
    })
  }

  return [...targets.values()]
}

async function handleMasterBind (data, appid, target, uin, force) {
  if (!force) {
    await data.reply("正在校验被@用户...")
    const ok = await verifyAvatar(appid, target.openid, uin)
    if (!ok) {
      await data.reply("代绑定失败：被@用户与真实QQ不符合。")
      return
    }
  }

  const saved = await saveMapping(appid, target.openid, uin)
  if (!saved) {
    await data.reply("代绑定失败：映射保存失败，请检查 Redis。")
    return
  }

  const targetName = target.name ? `${target.name} ` : ""
  const action = force ? "强制代绑定" : "代绑定"
  Bot.makeLog?.("info", [
    `QQBot ${action}成功`,
    `operator=${data.user_id}`,
    `target=${target.openid}`,
    `uin=${uin}`,
  ], data.self_id)
  await data.reply(`${action}成功：${targetName}${uin}`)
}

/**
 * 绑定命令处理（独立 app，通过 Bot.em 事件驱动）
 *
 *   #QQ绑定                 → 显示帮助 + 输入按钮（点击自动填入 #QQ绑定 ）
 *   #QQ绑定<QQ号>           → 头像 MD5 校验 → 双向映射 (Redis + JSON)
 *   #QQ绑定@用户 <QQ号>     → master 校验目标头像后代绑定
 *   #QQ强制绑定@用户 <QQ号> → master 跳过头像校验直接代绑定
 *   #QQ绑定openid <openid> <QQ号>     → master 校验目标头像后直接绑定
 *   #QQ强制绑定openid <openid> <QQ号> → master 跳过头像校验直接绑定
 *   #QQ解绑                 → TODO
 */
async function handleBindMessage (data) {
  const targetIds = ['QQBot']
  if (!targetIds.includes(data.bot?.adapter?.id)) return

  const rawOpenid = data._raw_user_id || data.sender?.user_id
  if (!rawOpenid || isGuildUserId(rawOpenid)) return

  const appid = getAppid(data.bot || data.self_id)
  const text = String(data.raw_message || "").trim()
  const commandText = getCommandText(data)
  const mentionTargets = getMentionTargets(data)

  // --- master 使用已知 openid 直接绑定 ---
  const openidBindPrefix = /^#QQ(?:强制)?绑定openid\b/i
  if (openidBindPrefix.test(commandText)) {
    if (!isMaster(data)) {
      Bot.makeLog?.("debug", [
        `QQBot 非master openid绑定忽略: user_id=${data.user_id} self_id=${data.self_id}`,
      ], data.self_id)
      return
    }

    const openidBindMatch = commandText.match(
      /^#QQ(强制)?绑定openid\s+([a-f0-9]{32})\s+(\d{5,12})\s*$/i,
    )
    if (!openidBindMatch) {
      await data.reply(
        "命令格式错误，例如：#QQ绑定openid 32位OPENID 123456",
      )
      return
    }

    const force = !!openidBindMatch[1]
    const targetOpenid = openidBindMatch[2]
    const uin = openidBindMatch[3]
    try {
      await handleMasterBind(data, appid, {
        openid: targetOpenid,
        name: `openid ${targetOpenid}`,
      }, uin, force)
    } catch (err) {
      Bot.makeLog?.("error", [
        "QQBot 主人 openid 绑定失败",
        appid,
        targetOpenid,
        uin,
        err,
      ], data.self_id)
      await data.reply("OPENID 绑定失败，请稍后重试。")
    }
    return
  }

  // --- master 代绑定：普通命令校验目标头像，强制命令跳过校验 ---
  const masterBindMatch = commandText.match(/^#QQ(强制)?绑定\s*(\d{5,12})\s*$/)
  if (masterBindMatch && (masterBindMatch[1] || mentionTargets.length > 0)) {
    if (data.message_type !== "group") {
      await data.reply("代绑定命令仅支持在群聊中使用。")
      return
    }

    if (!isMaster(data)) {
      Bot.makeLog?.("debug", [
        `QQBot 非master代绑定忽略: user_id=${data.user_id} self_id=${data.self_id}`,
      ], data.self_id)
      return
    }

    if (mentionTargets.length !== 1) {
      await data.reply("请只@一名用户，例如：#QQ绑定@某人 123456")
      return
    }

    const force = !!masterBindMatch[1]
    const uin = masterBindMatch[2]
    try {
      await handleMasterBind(data, appid, mentionTargets[0], uin, force)
    } catch (err) {
      Bot.makeLog?.("error", [
        "QQBot 主人代绑定失败",
        appid,
        mentionTargets[0].openid,
        uin,
        err,
      ], data.self_id)
      await data.reply("代绑定失败，请稍后重试。")
    }
    return
  }

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
      const saved = await saveMapping(appid, rawOpenid, uin)
      if (!saved) {
        await data.reply("绑定失败：映射保存失败，请检查 Redis。")
        return
      }
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
