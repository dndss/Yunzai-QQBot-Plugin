import { getAppid } from "./uinMap.js"
import { adaptMessageRecord, getRawSceneIndexes, sanitizeRawMessage } from "./messageRecord.js"

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
  return getRawSceneIndexes(event)
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

/** 将 msg_elements 的正文和附件统一解析为 Yunzai 消息段。 */
export function parseElementMessage (element) {
  const message = parseElementContent(element?.content)
  const imageUrls = new Set(message
    .filter(item => item?.type === "image")
    .map(item => item.url || item.file)
    .filter(Boolean))

  for (const attachment of Array.isArray(element?.attachments) ? element.attachments : []) {
    const url = attachment?.url
    if (!url || !String(attachment.content_type || "").startsWith("image/")) continue
    if (imageUrls.has(url)) continue
    imageUrls.add(url)
    message.push({
      type: "image",
      url,
      file: url,
      ...(attachment.filename ? { name: attachment.filename } : {}),
      ...(attachment.width !== undefined ? { width: attachment.width } : {}),
      ...(attachment.height !== undefined ? { height: attachment.height } : {}),
      ...(attachment.size !== undefined ? { size: attachment.size } : {}),
    })
  }
  return message
}

/** 生成引用预览文本；纯图片附件使用可读占位符。 */
export function getElementBrief (element, message = parseElementMessage(element)) {
  if (typeof element?.content === "string" && element.content) return element.content
  return message.map(item => item?.type === "image" ? "[图片]" : item?.text || "").join("")
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

async function getStoredRecord (key) {
  if (global.redis) {
    try {
      const raw = await redis.get(key)
      if (raw) {
        const record = JSON.parse(raw)
        if (record?.raw) record.raw = sanitizeRawMessage(record.raw)
        return record
      }
    } catch (err) {
      Bot.makeLog?.("error", ["QQBot 引用消息缓存读取失败", key, err])
    }
  }
  const raw = memCache.get(key)
  if (!raw) return null
  try {
    const record = JSON.parse(raw)
    if (record?.raw) record.raw = sanitizeRawMessage(record.raw)
    return record
  } catch {
    return null
  }
}

function getStoredMessageId (record) {
  return record?.message_id || record?.messageid || record?.raw?.message_id ||
    record?.raw?.messageid || record?.raw?.id
}

async function ensureStoredAlias (key, record, label) {
  let value
  try {
    value = JSON.stringify(record)
  } catch (err) {
    Bot.makeLog?.("error", ["QQBot 消息缓存索引修复序列化失败", label, err])
    return
  }

  // 内存始终补齐，使 Redis 短暂不可用时仍可通过另一种索引查询。
  memSet(key, value)
  if (!global.redis) return
  try {
    if (await redis.get(key)) return
    await redis.set(key, value, { EX: MSG_TTL })
    Bot.makeLog?.("debug", ["QQBot 消息缓存已自动补写索引", label])
  } catch (err) {
    Bot.makeLog?.("error", ["QQBot 消息缓存索引自动修复失败", label, err])
  }
}

/** msg_idx 命中时检查并修复可能缺失的 message_id 别名。 */
async function ensureMessageIdAlias (botOrId, record) {
  const messageId = getStoredMessageId(record)
  if (!messageId) return
  await ensureStoredAlias(
    getIdKey(getAppid(botOrId), messageId),
    record,
    `message_id=${messageId}`,
  )
}

/** message_id 命中时检查并修复可能缺失的 msg_idx 别名。 */
async function ensureMsgIdxAlias (botOrId, record) {
  const msgIdx = record?.msg_idx || record?.msgidx
  if (!msgIdx) return
  await ensureStoredAlias(
    getIdxKey(getAppid(botOrId), msgIdx),
    record,
    `msg_idx=${msgIdx}`,
  )
}

async function adaptStoredRecord (botOrId, record) {
  if (!record) return null
  const bot = typeof botOrId === "object" ? botOrId : Bot?.[botOrId]
  const data = await adaptMessageRecord(bot?.adapter, bot || botOrId, record)
  if (!data) return data

  const { ref_msg_idx } = parseSceneExt(record.raw)
  if (!ref_msg_idx) return data
  const appid = getAppid(bot || botOrId)
  const replyRecord = await getStoredRecord(getIdxKey(appid, ref_msg_idx))
  if (replyRecord) {
    const reply = await adaptMessageRecord(bot?.adapter, bot || botOrId, replyRecord)
    data.source = {
      user_id: reply.user_id,
      time: reply.time,
      seq: reply.message_id,
      rand: 1,
      message: reply.raw_message,
    }
    data.getReply = async () => reply
    return data
  }

  const elements = record.raw?.msg_elements || record.raw?.msgelements
  const element = Array.isArray(elements)
    ? elements.find(item => (item?.msg_idx || item?.msgidx) === ref_msg_idx) || elements[0]
    : undefined
  if (!element) return data
  const message = parseElementMessage(element)
  if (!message.length) return data
  const rawMessage = getElementBrief(element, message)
  const fallback = {
    message,
    raw_message: rawMessage,
    sender: {},
    time: data.time,
    group_id: data.group_id,
  }
  data.source = { user_id: "", time: data.time, seq: "", rand: 1, message: rawMessage }
  data.getReply = async () => fallback
  return data
}

export async function getRecordByMsgIdx (botOrId, msgIdx) {
  if (!msgIdx) return null
  const record = await getStoredRecord(getIdxKey(getAppid(botOrId), msgIdx))
  if (record) await ensureMessageIdAlias(botOrId, record)
  return adaptStoredRecord(botOrId, record)
}

export async function getRecordByMsgId (botOrId, messageId) {
  if (!messageId) return null
  const record = await getStoredRecord(getIdKey(getAppid(botOrId), messageId))
  if (record) await ensureMsgIdxAlias(botOrId, record)
  return adaptStoredRecord(botOrId, record)
}

/** 消息撤回后删除对应缓存，使 getMsg / 引用查询能反映消息已不存在 */
export async function deleteMsgRecord (botOrId, messageId) {
  if (!messageId) return
  const appid = getAppid(botOrId)
  const idKey = getIdKey(appid, messageId)
  const record = await getStoredRecord(idKey)
  const keys = [idKey]
  const msgIdx = record?.msg_idx || record?.msgidx
  if (msgIdx) keys.push(getIdxKey(appid, msgIdx))
  if (global.redis) {
    try {
      await redis.del(keys)
    } catch (err) {
      Bot.makeLog?.("error", ["QQBot 引用消息缓存删除失败", keys, err])
    }
  }
  for (const key of keys) memCache.delete(key)
}
