import { getAppid } from "./uinMap.js"

const MSG_IDX_PREFIX = "QQBot:msgIdx"
const MSG_ID_PREFIX = "QQBot:msgId"
/** 消息记录缓存有效期（秒） */
const MSG_TTL = 7 * 24 * 60 * 60

/** Redis 不可用时的内存兜底缓存 */
const memCache = new Map()
const MEM_CACHE_MAX = 5000

function memSet (key, value) {
  if (memCache.has(key)) memCache.delete(key)
  memCache.set(key, value)
  while (memCache.size > MEM_CACHE_MAX) memCache.delete(memCache.keys().next().value)
}

function getIdxKey (appid, msgIdx) {
  return `${MSG_IDX_PREFIX}:${appid}:${msgIdx}`
}

function getIdKey (appid, messageId) {
  return `${MSG_ID_PREFIX}:${appid}:${messageId}`
}

/** 从群消息事件的 message_scene.ext 中解析本条消息与被引用消息的索引 */
export function parseSceneExt (event) {
  const result = {}
  const ext = event?.message_scene?.ext
  if (!Array.isArray(ext)) return result
  for (const item of ext) {
    if (typeof item !== "string") continue
    if (item.startsWith("msg_idx=")) result.msg_idx = item.slice("msg_idx=".length)
    else if (item.startsWith("ref_msg_idx=")) result.ref_msg_idx = item.slice("ref_msg_idx=".length)
  }
  return result
}

/** 将 msg_elements 的 markdown 内容解析为消息段（图片/文本） */
export function parseElementContent (content) {
  const message = []
  if (typeof content !== "string" || !content) return message
  const regex = /!\[[^\]]*\]\(([^)]*)\)/g
  let last = 0
  let match
  while ((match = regex.exec(content))) {
    if (match.index > last) message.push({ type: "text", text: content.slice(last, match.index) })
    message.push({ type: "image", url: match[1], file: match[1] })
    last = match.index + match[0].length
  }
  if (last < content.length) message.push({ type: "text", text: content.slice(last) })
  return message
}

/** 按 msg_idx 与 message_id 双键存储完整消息记录 */
export async function saveMsgRecord (botOrId, record) {
  if (!record?.msg_idx || !record?.message_id) return false
  const appid = getAppid(botOrId)
  let value
  try {
    value = JSON.stringify(record)
  } catch (err) {
    Bot.makeLog?.("error", ["QQBot 引用消息缓存序列化失败", err])
    return false
  }
  const keys = [getIdxKey(appid, record.msg_idx), getIdKey(appid, record.message_id)]
  if (global.redis) {
    try {
      for (const key of keys) await redis.set(key, value, { EX: MSG_TTL })
      return true
    } catch (err) {
      Bot.makeLog?.("error", ["QQBot 引用消息缓存写入失败", err])
    }
  }
  for (const key of keys) memSet(key, value)
  return true
}

async function getRecord (key) {
  if (global.redis) {
    try {
      const raw = await redis.get(key)
      if (raw) return JSON.parse(raw)
    } catch (err) {
      Bot.makeLog?.("error", ["QQBot 引用消息缓存读取失败", key, err])
    }
  }
  const raw = memCache.get(key)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function getRecordByMsgIdx (botOrId, msgIdx) {
  if (!msgIdx) return null
  return getRecord(getIdxKey(getAppid(botOrId), msgIdx))
}

export async function getRecordByMsgId (botOrId, messageId) {
  if (!messageId) return null
  return getRecord(getIdKey(getAppid(botOrId), messageId))
}

/** 消息撤回后删除对应缓存，使 getMsg / 引用查询能反映消息已不存在 */
export async function deleteMsgRecord (botOrId, messageId) {
  if (!messageId) return
  const appid = getAppid(botOrId)
  const idKey = getIdKey(appid, messageId)
  const record = await getRecord(idKey)
  const keys = [idKey]
  if (record?.msg_idx) keys.push(getIdxKey(appid, record.msg_idx))
  if (global.redis) {
    try {
      await redis.del(keys)
    } catch (err) {
      Bot.makeLog?.("error", ["QQBot 引用消息缓存删除失败", keys, err])
    }
  }
  for (const key of keys) memCache.delete(key)
}
