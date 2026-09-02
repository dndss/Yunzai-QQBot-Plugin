import fs from "node:fs/promises"
import path from "node:path"

import { adaptMessageRecord, getRawSceneIndexes, sanitizeRawMessage } from "./messageRecord.js"

export const JSONL_MESSAGE_RECORD_VERSION = 1

let messageStoreRoot = path.resolve("data", "bots")
const writeQueues = new Map()
const RECALLED = Symbol("recalled")

/** QQ 群引用索引不是消息 ID，不能用于被动回复、撤回或按消息 ID 查询。 */
export function isReferenceMessageIndex (value) {
  return /^(?:REFIDX_|TMP_)/.test(String(value || ""))
}

/** 仅供测试或嵌入方覆盖默认 data/bots 根目录。 */
export function setMessageStoreRoot (directory) {
  messageStoreRoot = path.resolve(directory)
}

export function getMessageStoreRoot () {
  return messageStoreRoot
}

function getBotId (botOrId, record = {}) {
  return String(
    record.self_id ||
    (typeof botOrId === "object" ? botOrId?.uin || botOrId?.self_id : botOrId) ||
    "",
  )
}

function encodePathSegment (value, label) {
  const source = String(value || "")
  if (!source) throw new TypeError(`${label} 不能为空`)
  if (source === "." || source === "..") throw new TypeError(`${label} 无效`)
  return source
    .replace(/[<>:"/\\|?*%\u0000-\u001f]/g, char =>
      `%${char.codePointAt(0).toString(16).toUpperCase().padStart(2, "0")}`)
    .replace(/[. ]+$/g, value => [...value]
      .map(char => `%${char.codePointAt(0).toString(16).toUpperCase().padStart(2, "0")}`)
      .join(""))
}

function getRecordTime (record) {
  const value = Number(record.time ?? record.timestamp)
  if (!Number.isFinite(value) || value <= 0) return Date.now()
  return value < 1e12 ? value * 1000 : value
}

function formatDate (time) {
  const date = new Date(time)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function firstDefined (...values) {
  return values.find(value => value !== undefined && value !== null && value !== "")
}

function getRawUserId (raw) {
  return firstDefined(
    raw?.user_id,
    raw?.userid,
    raw?.sender?.user_id,
    raw?.sender?.userid,
    raw?.sender?.user_openid,
    raw?.author?.member_openid,
    raw?.author?.memberopenid,
    raw?.author?.id,
  )
}

function getRawGroupId (raw) {
  return firstDefined(raw?.group_id, raw?.groupid, raw?.group_openid, raw?.groupopenid)
}

function getConversation (record) {
  const scene = record.scene === "private" ? "private" : "group"
  if (scene === "private") {
    const userOpenId = firstDefined(record.user_openid, record.raw_user_id, getRawUserId(record.raw))
    return { scene, userOpenId: String(userOpenId || "") }
  }
  const groupOpenId = firstDefined(record.group_openid, record.raw_group_id, getRawGroupId(record.raw))
  return { scene, groupOpenId: String(groupOpenId || "") }
}

function getConversationDirectory (botId, conversation) {
  const botDirectory = path.join(messageStoreRoot, encodePathSegment(botId, "botId"), "messages")
  if (conversation.scene === "private")
    return path.join(botDirectory, "users", encodePathSegment(conversation.userOpenId, "userOpenId"))
  return path.join(botDirectory, "groups", encodePathSegment(conversation.groupOpenId, "groupOpenId"))
}

function normalizeRecord (botOrId, record) {
  const botId = getBotId(botOrId, record)
  const conversation = getConversation(record)
  const timeMs = getRecordTime(record)
  const time = Math.floor(timeMs / 1000)
  const indexes = record.raw ? getRawSceneIndexes(record.raw) : {}
  const type = record.type === "recall" ? "recall" : "message"
  const normalized = {
    version: JSONL_MESSAGE_RECORD_VERSION,
    type,
    direction: record.direction === "outgoing" ? "outgoing" : "incoming",
    scene: conversation.scene,
    self_id: botId,
    time,
    logged_at: new Date(timeMs).toISOString(),
    ...(record.message_id && !isReferenceMessageIndex(record.message_id)
      ? { message_id: String(record.message_id) }
      : {}),
    ...(record.msg_idx || indexes.msg_idx
      ? { msg_idx: String(record.msg_idx || indexes.msg_idx) }
      : {}),
    ...(record.ref_msg_idx || indexes.ref_msg_idx
      ? { ref_msg_idx: String(record.ref_msg_idx || indexes.ref_msg_idx) }
      : {}),
    ...(conversation.scene === "private"
      ? { user_openid: conversation.userOpenId }
      : { group_openid: conversation.groupOpenId }),
  }

  if (type === "message") {
    normalized.sender = sanitizeRawMessage(record.sender || {})
    normalized.message = sanitizeRawMessage(Array.isArray(record.message) ? record.message : [])
      .map(segment => {
        if (conversation.scene !== "group" || segment?.type !== "at") return segment
        const rawUserId = firstDefined(
          segment._raw_user_id,
          segment.user_openid,
          segment.user_id,
          segment.qq,
        )
        if (!rawUserId) return segment
        const stored = { ...segment, user_openid: String(rawUserId) }
        delete stored._raw_user_id
        delete stored.user_id
        delete stored.qq
        return stored
      })
    normalized.raw_message = String(record.raw_message || "")
    if (record.raw !== undefined) normalized.raw = sanitizeRawMessage(record.raw)
    if (record.raw_request !== undefined)
      normalized.raw_request = sanitizeRawMessage(record.raw_request)
    if (record.raw_response !== undefined)
      normalized.raw_response = sanitizeRawMessage(record.raw_response)
  }
  return normalized
}

function enqueueAppend (filePath, line) {
  const previous = writeQueues.get(filePath) || Promise.resolve()
  const current = previous
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.appendFile(filePath, line, "utf8")
    })
  writeQueues.set(filePath, current)
  return current.finally(() => {
    if (writeQueues.get(filePath) === current) writeQueues.delete(filePath)
  })
}

/** 按 bot、会话原始 OpenID 与本地日期追加一条 JSONL 消息记录。 */
export async function saveMsgRecord (botOrId, record) {
  let normalized
  try {
    normalized = normalizeRecord(botOrId, record || {})
    const conversation = getConversation(normalized)
    const directory = getConversationDirectory(normalized.self_id, conversation)
    const filePath = path.join(directory, `${formatDate(normalized.time * 1000)}.jsonl`)
    await enqueueAppend(filePath, `${JSON.stringify(normalized)}\n`)
    return true
  } catch (err) {
    globalThis.Bot?.makeLog?.("error", ["QQBot JSONL 消息记录写入失败", normalized || record, err])
    return false
  }
}

async function listJsonlFiles (directory, recursive) {
  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch (err) {
    if (err?.code === "ENOENT") return []
    throw err
  }

  const files = []
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(entryPath)
    else if (recursive && entry.isDirectory()) files.push(...await listJsonlFiles(entryPath, true))
  }
  return files
}

function getSearchDirectory (botOrId, scope = {}) {
  const botId = getBotId(botOrId)
  const base = path.join(messageStoreRoot, encodePathSegment(botId, "botId"), "messages")
  if (scope.groupOpenId)
    return {
      directory: path.join(base, "groups", encodePathSegment(scope.groupOpenId, "groupOpenId")),
      recursive: false,
    }
  if (scope.userOpenId)
    return {
      directory: path.join(base, "users", encodePathSegment(scope.userOpenId, "userOpenId")),
      recursive: false,
    }
  if (scope.scene === "group") return { directory: path.join(base, "groups"), recursive: true }
  if (scope.scene === "private") return { directory: path.join(base, "users"), recursive: true }
  return { directory: base, recursive: true }
}

async function findStoredRecord (botOrId, field, value, scope) {
  const search = getSearchDirectory(botOrId, scope)
  const files = await listJsonlFiles(search.directory, search.recursive)
  files.sort((left, right) => {
    const byDate = path.basename(right).localeCompare(path.basename(left))
    return byDate || right.localeCompare(left)
  })

  for (const filePath of files) {
    let content
    try {
      content = await fs.readFile(filePath, "utf8")
    } catch (err) {
      globalThis.Bot?.makeLog?.("error", ["QQBot JSONL 消息记录读取失败", filePath, err])
      continue
    }
    const lines = content.split(/\r?\n/)
    for (let index = lines.length - 1; index >= 0; index--) {
      if (!lines[index]) continue
      let record
      try {
        record = JSON.parse(lines[index])
      } catch (err) {
        globalThis.Bot?.makeLog?.("warn", ["QQBot JSONL 消息记录存在无效行", filePath, index + 1, err])
        continue
      }
      if (String(record?.[field] || "") !== String(value)) continue
      return record.type === "recall" ? RECALLED : record
    }
  }
  return null
}

function getRecordScope (record) {
  if (record.group_openid) return { groupOpenId: record.group_openid }
  if (record.user_openid) return { userOpenId: record.user_openid }
}

async function adaptStoredRecord (botOrId, record) {
  if (!record || record === RECALLED) return null
  const bot = typeof botOrId === "object" ? botOrId : globalThis.Bot?.[botOrId]
  const data = await adaptMessageRecord(bot?.adapter, bot || botOrId, record)
  if (!data || !record.ref_msg_idx) return data

  const replyRecord = await findStoredRecord(
    botOrId,
    "msg_idx",
    record.ref_msg_idx,
    getRecordScope(record),
  )
  if (!replyRecord || replyRecord === RECALLED) return data
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

export async function getRecordByMsgIdx (botOrId, msgIdx, scope) {
  if (!msgIdx) return null
  return adaptStoredRecord(botOrId, await findStoredRecord(botOrId, "msg_idx", msgIdx, scope))
}

export async function getRecordByMsgId (botOrId, messageId, scope) {
  if (!messageId || isReferenceMessageIndex(messageId)) return null
  return adaptStoredRecord(botOrId, await findStoredRecord(botOrId, "message_id", messageId, scope))
}

/** 撤回时追加标记，不改写或物理删除已经持久化的消息行。 */
export async function markMsgRecordRecalled (botOrId, messageId, scope) {
  if (!messageId || isReferenceMessageIndex(messageId)) return false
  const record = await findStoredRecord(botOrId, "message_id", messageId, scope)
  if (!record || record === RECALLED) return false
  return saveMsgRecord(botOrId, {
    type: "recall",
    direction: record.direction,
    scene: record.scene,
    self_id: record.self_id,
    message_id: record.message_id,
    msg_idx: record.msg_idx,
    group_openid: record.group_openid,
    user_openid: record.user_openid,
    time: Date.now(),
  })
}

/** 兼容旧内部调用名称；实际行为是追加撤回标记。 */
export const deleteMsgRecord = markMsgRecordRecalled

/** 从群消息事件的 message_scene.ext 中解析本条消息与被引用消息的索引。 */
export function parseSceneExt (event) {
  return getRawSceneIndexes(event)
}

/** 将 msg_elements 的 markdown 内容解析为消息段（图片/文本）。 */
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
