import crypto from "node:crypto"

export const QQBOT_MAP_PREFIX = "map:qqbot"
export const QQBOT_UIN_PREFIX = "map:uin"
export const QQBOT_BIND_PREFIX = "map:qqbot:bind"

export function isQQUin (value) {
  return /^\d{5,12}$/.test(String(value || ""))
}

export function isGuildUserId (value) {
  return String(value || "").startsWith("qg_")
}

export function getAppid (botOrId) {
  const bot = typeof botOrId === "object" ? botOrId : Bot?.[botOrId]
  return String(bot?.info?.appid || bot?.info?.id || bot?.uin || botOrId || "")
}

export function getOpenidKey (appid, openid) {
  return `${QQBOT_MAP_PREFIX}:${appid}:${openid}`
}

export function getUinKey (uin) {
  return `${QQBOT_UIN_PREFIX}:${uin}`
}

export function getAppUinKey (appid, uin) {
  return `${QQBOT_UIN_PREFIX}:${appid}:${uin}`
}

export async function getMappedUin (appid, openid) {
  if (!global.redis || !appid || !openid || isGuildUserId(openid)) return false
  try {
    return await redis.get(getOpenidKey(appid, openid))
  } catch (err) {
    Bot.makeLog?.("error", ["QQBot 映射读取失败", appid, openid, err])
    return false
  }
}

export async function getMappedOpenid (appid, uin) {
  if (!global.redis || !appid || !uin || !isQQUin(uin)) return false
  try {
    const appRaw = await redis.get(getAppUinKey(appid, uin))
    if (appRaw) return JSON.parse(appRaw).openid

    const raw = await redis.get(getUinKey(uin))
    if (!raw) return false
    const data = JSON.parse(raw)
    if (!data?.openid) return false
    if (data.appid && String(data.appid) !== String(appid)) return false
    return data.openid
  } catch (err) {
    Bot.makeLog?.("error", ["QQBot 映射反查失败", appid, uin, err])
    return false
  }
}

async function syncToJsonFile (appid, openid, uin) {
  const fs = await import("node:fs")
  const path = await import("node:path")
  const filePath = path.resolve("data/QQBot/uin-mappings.json")
  let raw = {}
  if (fs.existsSync(filePath)) {
    try {
      raw = JSON.parse(fs.readFileSync(filePath, "utf8"))
    } catch {
      raw = {}
    }
  }
  if (!raw[appid]) raw[appid] = {}
  raw[appid][openid] = String(uin)
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(raw, null, 2), "utf8")
}

export async function saveMapping (appid, openid, uin) {
  if (!global.redis || !appid || !openid || !isQQUin(uin)) return false
  const data = JSON.stringify({ appid: String(appid), openid: String(openid) })
  await redis.set(getOpenidKey(appid, openid), String(uin))
  await redis.set(getUinKey(uin), data)
  await redis.set(getAppUinKey(appid, uin), data)
  await syncToJsonFile(appid, openid, uin)
  return true
}

export async function loadMappingsFromFile (filePath) {
  if (!global.redis) return 0
  const fs = await import("node:fs")
  const path = await import("node:path")
  const resolved = path.resolve(filePath || "data/QQBot/uin-mappings.json")
  if (!fs.existsSync(resolved)) {
    Bot.makeLog?.("info", ["QQBot 映射文件不存在，跳过加载", resolved])
    return 0
  }
  let raw
  try {
    raw = JSON.parse(fs.readFileSync(resolved, "utf8"))
  } catch (err) {
    Bot.makeLog?.("error", ["QQBot 映射文件解析失败", resolved, err])
    return 0
  }
  if (!raw || typeof raw !== "object") return 0
  let count = 0
  for (const appid of Object.keys(raw)) {
    const map = raw[appid]
    if (!map || typeof map !== "object") continue
    for (const openid of Object.keys(map)) {
      const uin = String(map[openid] || "")
      if (!isQQUin(uin)) {
        Bot.makeLog?.("warn", ["QQBot 映射文件跳过非法QQ号", appid, openid, uin])
        continue
      }
      try {
        const existing = await redis.get(getOpenidKey(appid, openid))
        if (existing === uin) {
          Bot.makeLog?.("debug", ["QQBot 映射已存在且一致，跳过", appid, openid, uin])
          continue
        }
        if (existing) {
          Bot.makeLog?.("info", ["QQBot 映射已变更，以文件为准覆盖", appid, openid, existing, "->", uin])
        }
        const data = JSON.stringify({ appid: String(appid), openid: String(openid) })
        await redis.set(getOpenidKey(appid, openid), String(uin))
        await redis.set(getUinKey(uin), data)
        await redis.set(getAppUinKey(appid, uin), data)
        count++
      } catch (err) {
        Bot.makeLog?.("error", ["QQBot 映射文件写入Redis失败", appid, openid, uin, err])
      }
    }
  }
  Bot.makeLog?.("info", [`QQBot 映射文件加载完成：${resolved}，共 ${count} 条映射`])
  return count
}

export async function applyUinMapping (data, openid) {
  const appid = getAppid(data.bot || data.self_id)
  const realUin = await getMappedUin(appid, openid)
  if (!realUin) return false
  data._raw_user_id = openid
  data.sender = { ...data.sender, _raw_user_id: openid, user_id: realUin }
  return realUin
}

export async function translateToOpenid (botOrId, userId) {
  const id = String(userId || "")
  if (!isQQUin(id)) return id
  const appid = getAppid(botOrId)
  return (await getMappedOpenid(appid, id)) || id
}

export function getBindKey (appid, openid) {
  return `${QQBOT_BIND_PREFIX}:${appid}:${openid}`
}

export async function createBindSession (appid, openid) {
  if (!global.redis || !appid || !openid) return false
  await redis.set(getBindKey(appid, openid), "1", { EX: 300 })
  return true
}

export async function consumeBindSession (appid, openid) {
  if (!global.redis || !appid || !openid) return false
  const key = getBindKey(appid, openid)
  const exists = await redis.get(key)
  if (exists) await redis.del(key)
  return !!exists
}

async function avatarMd5 (url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "curl/8.0.0",
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
    }
  })
  if (!res.ok) throw new Error(`头像获取失败：${res.status} ${res.statusText} ${url}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  if (!buffer.length) return false
  const md5 = crypto.createHash("md5").update(buffer).digest("hex")
  Bot.makeLog?.("debug", ["QQBot 头像MD5", url, md5, buffer.length])
  return md5
}

export async function verifyAvatar (appid, openid, uin) {
  const qqbotAvatar = `https://thirdqq.qlogo.cn/qqapp/${appid}/${openid}/640`
  const qqAvatar = `https://q.qlogo.cn/g?b=qq&nk=${uin}&s=640`
  const [md5A, md5B] = await Promise.all([avatarMd5(qqbotAvatar), avatarMd5(qqAvatar)])
  return !!md5A && md5A === md5B
}

export async function handleBindMessage (data, rawOpenid, adapter, replyData) {
  if (!rawOpenid || isGuildUserId(rawOpenid)) return false
  const appid = getAppid(data.bot || data.self_id)
  const text = String(data.raw_message || "").trim()

  if (["#QQ绑定"].includes(text)) {
    await createBindSession(appid, rawOpenid)
    await adapter.sendFriendMsg(replyData || { ...data, user_id: rawOpenid }, "请输入你的 QQ 号（5 分钟内有效）")
    return true
  }

  if (!isQQUin(text)) return false
  if (!(await consumeBindSession(appid, rawOpenid))) return false

  await adapter.sendFriendMsg(replyData || { ...data, user_id: rawOpenid }, "正在校验")
  try {
    const ok = await verifyAvatar(appid, rawOpenid, text)
    if (!ok) {
      await adapter.sendFriendMsg(replyData || { ...data, user_id: rawOpenid }, "绑定失败 和 真实QQ不符合")
      return true
    }
    await saveMapping(appid, rawOpenid, text)
    await adapter.sendFriendMsg(replyData || { ...data, user_id: rawOpenid }, `绑定成功：${text}`)
    return true
  } catch (err) {
    Bot.makeLog?.("error", ["QQBot 绑定校验失败", appid, rawOpenid, text, err], data.self_id)
    await adapter.sendFriendMsg(replyData || { ...data, user_id: rawOpenid }, "绑定失败 请稍后重试。")
    return true
  }
}
