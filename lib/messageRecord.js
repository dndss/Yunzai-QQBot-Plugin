import { getAppid, getMappedUin } from "./uinMap.js"
import { getGroupUin } from "./groupMap.js"
import { makeStreamReplyPayload } from "./streamMessage.js"

export const MESSAGE_RECORD_VERSION = 2

function firstDefined (...values) {
  return values.find(value => value !== undefined && value !== null && value !== "")
}

function cloneRawValue (value) {
  if (value === undefined) return undefined
  const raw = typeof value?.toJSON === "function" ? value.toJSON() : value
  return JSON.parse(JSON.stringify(raw, (_key, item) => {
    if (Array.isArray(item)) return item.filter(value =>
      typeof value !== "string" || !/^auth_?token=/i.test(value))
    return item
  }))
}

/** 生成可写入 Redis 的官方事件快照，并移除 message_scene.ext 中的 auth token。 */
export function sanitizeRawMessage (raw) {
  return cloneRawValue(raw)
}

function getSceneExt (raw) {
  const scene = raw?.message_scene || raw?.messagescene
  return Array.isArray(scene?.ext) ? scene.ext : []
}

export function getRawSceneIndexes (raw) {
  const result = {}
  for (const item of getSceneExt(raw)) {
    if (typeof item !== "string") continue
    if (item.startsWith("msg_idx=")) result.msg_idx = item.slice("msg_idx=".length)
    else if (item.startsWith("msgidx=")) result.msg_idx = item.slice("msgidx=".length)
    else if (item.startsWith("ref_msg_idx=")) result.ref_msg_idx = item.slice("ref_msg_idx=".length)
    else if (item.startsWith("refmsgidx=")) result.ref_msg_idx = item.slice("refmsgidx=".length)
  }
  return result
}

function getRawMessageId (raw) {
  return firstDefined(raw?.message_id, raw?.messageid, raw?.id)
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

function normalizeRole (raw) {
  const role = firstDefined(
    raw?.author?.member_role,
    raw?.author?.memberrole,
    raw?.sender?.member_role,
    raw?.sender?.memberrole,
    raw?.sender?.role,
  )
  if (role) return role
  const permissions = raw?.sender?.permissions
  if (!Array.isArray(permissions)) return typeof permissions === "string" ? permissions : undefined
  if (permissions.includes("owner")) return "owner"
  if (permissions.includes("admin")) return "admin"
  if (permissions.includes("member")) return "member"
}

async function normalizeSegments (raw, appid, messageType) {
  const message = []
  for (const segment of Array.isArray(raw?.message) ? raw.message : []) {
    if (!segment || typeof segment !== "object") continue
    const item = segment.data && typeof segment.data === "object"
      ? { ...segment.data, type: segment.type }
      : { ...segment }
    if (item.type === "at" && messageType === "group") {
      const rawUserId = String(firstDefined(item.user_id, item.userid, item.qq) || "")
      item._raw_user_id = rawUserId
      item.qq = rawUserId === "all" ? "all" : await getMappedUin(appid, rawUserId) || rawUserId
      item.user_id = item.qq
      delete item.userid
    }
    message.push(item)
  }
  return message
}

function makeRuntimeContext (adapter, bot, message) {
  if (Object.hasOwn(message, "raw")) {
    const raw = message.raw
    delete message.raw
    Object.defineProperty(message, "raw", { value: raw, configurable: true })
  }
  if (!bot || !adapter) return message
  Object.defineProperty(message, "bot", { value: bot, configurable: true })

  if (message.message_type === "group" && message.group_id) {
    const group = bot.pickGroup(message.group_id)
    Object.defineProperty(message, "group", { value: group, configurable: true })
    if (message.user_id)
      Object.defineProperty(message, "member", {
        value: group.pickMember(message.user_id),
        configurable: true,
      })
    message.reply = msg => adapter.sendGroupMsg({
      ...message,
      bot,
      group_id: message._raw_group_id || message.group_id,
      user_id: message._raw_user_id || message.user_id,
    }, msg)
    message.recall = () => adapter.recallGroupMsg({
      ...message,
      bot,
      group_id: message._raw_group_id || message.group_id,
    }, message.message_id)
  } else if (message.message_type === "private" && message.user_id) {
    Object.defineProperty(message, "friend", {
      value: bot.pickFriend(message.user_id),
      configurable: true,
    })
    message.reply = msg => adapter.sendFriendMsg({
      ...message,
      bot,
      user_id: message._raw_user_id || message.user_id,
    }, msg)
    message.streamReply = (payload, options) => adapter.sendFriendStreamMsg({
      ...message,
      bot,
      user_id: message._raw_user_id || message.user_id,
    }, makeStreamReplyPayload(payload, message), options)
    message.recall = () => adapter.recallFriendMsg({
      ...message,
      bot,
      user_id: message._raw_user_id || message.user_id,
    }, message.message_id)
  }
  return message
}

async function adaptIncomingRecord (adapter, bot, record) {
  const raw = sanitizeRawMessage(record.raw) || {}
  const appid = getAppid(bot || record.self_id)
  const rawUserId = String(getRawUserId(raw) || "")
  const rawGroupId = String(getRawGroupId(raw) || "")
  const sdkMessageType = firstDefined(raw.message_type, raw.messagetype, record.scene)
  const messageType = sdkMessageType === "guild" ? "group" : sdkMessageType
  const mappedUserId = rawUserId && messageType !== "guild"
    ? await getMappedUin(appid, rawUserId)
    : false
  const mappedGroupId = rawGroupId && record.scene === "group"
    ? await getGroupUin(bot || record.self_id, rawGroupId)
    : false
  const userId = record.scene === "guild" ? `qg_${rawUserId}` : mappedUserId || rawUserId
  const groupId = record.scene === "guild"
    ? `qg_${firstDefined(raw.guild_id, raw.guildid)}-${firstDefined(raw.channel_id, raw.channelid)}`
    : mappedGroupId || rawGroupId
  const role = normalizeRole(raw)
  const sender = {
    user_id: userId,
    _raw_user_id: rawUserId,
    nickname: firstDefined(
      raw.author?.username,
      raw.sender?.user_name,
      raw.sender?.username,
      raw.sender?.nickname,
    ),
    card: firstDefined(raw.member?.nick, raw.sender?.card),
    role,
    member_role: role,
    permissions: raw.sender?.permissions,
    bot: raw.author?.bot === true || raw.sender?.bot === true,
    union_openid: firstDefined(raw.author?.union_openid, raw.author?.unionopenid),
    is_owner: role === "owner",
    is_admin: role === "owner" || role === "admin",
  }
  const message = await normalizeSegments(raw, appid, messageType)
  const data = {
    raw,
    self_id: record.self_id || bot?.uin,
    post_type: firstDefined(raw.post_type, raw.posttype, "message"),
    message_type: messageType,
    sub_type: firstDefined(raw.sub_type, raw.subtype, record.scene === "private" ? "friend" : "normal"),
    message_id: record.message_id || getRawMessageId(raw),
    message_seq: record.msg_idx,
    msg_idx: record.msg_idx,
    time: Number(firstDefined(raw.timestamp, raw.time)) || Math.floor(Date.now() / 1000),
    user_id: userId,
    _raw_user_id: rawUserId,
    group_id: groupId || undefined,
    _raw_group_id: rawGroupId || undefined,
    sender,
    message,
    raw_message: firstDefined(raw.raw_message, raw.rawmessage, raw.content, ""),
    direction: "incoming",
  }
  return makeRuntimeContext(adapter, bot, data)
}

function adaptOutgoingRecord (adapter, bot, record) {
  const context = record.context || {}
  const payload = record.payload || {}
  const raw = sanitizeRawMessage(record.raw) || {}
  const userId = context.user_id || record.self_id || bot?.uin
  const data = {
    raw,
    self_id: record.self_id || bot?.uin,
    post_type: "message",
    message_type: record.scene === "private" ? "private" : "group",
    sub_type: record.scene === "private" ? "friend" : "normal",
    message_id: record.message_id || getRawMessageId(raw),
    message_seq: record.msg_idx,
    msg_idx: record.msg_idx,
    time: Number(firstDefined(raw.timestamp, raw.time)) || Math.floor(Date.now() / 1000),
    user_id: userId,
    _raw_user_id: context.raw_user_id || bot?.info?.id || userId,
    group_id: context.group_id,
    _raw_group_id: context.raw_group_id,
    sender: {
      user_id: userId,
      _raw_user_id: context.raw_user_id || bot?.info?.id || userId,
      nickname: context.nickname || bot?.nickname,
      bot: true,
      is_owner: false,
      is_admin: false,
    },
    message: Array.isArray(payload.message) ? payload.message : [],
    raw_message: payload.raw_message || raw.brief || "",
    direction: "outgoing",
  }
  return makeRuntimeContext(adapter, bot, data)
}

function adaptLegacyRecord (adapter, bot, record) {
  const data = {
    ...record,
    raw: sanitizeRawMessage(record.raw),
    self_id: record.self_id || bot?.uin,
    post_type: record.post_type || record.posttype || "message",
    message_type: record.message_type || record.messagetype || "group",
    sub_type: record.sub_type || record.subtype || "normal",
    message_id: record.message_id || record.messageid,
    message_seq: record.message_seq || record.messageseq || record.msg_idx || record.msgidx,
    msg_idx: record.msg_idx || record.msgidx,
    user_id: record.user_id || record.userid,
    _raw_user_id: record._raw_user_id || record.rawuserid,
    group_id: record.group_id || record.groupid,
    _raw_group_id: record._raw_group_id || record.rawgroupid,
    raw_message: record.raw_message || record.rawmessage || "",
    sender: {
      ...record.sender,
      user_id: record.sender?.user_id || record.sender?.userid || record.user_id || record.userid,
      _raw_user_id: record.sender?._raw_user_id || record.sender?.rawuserid || record._raw_user_id || record.rawuserid,
      nickname: record.sender?.nickname || record.sender?.username,
    },
  }
  return makeRuntimeContext(adapter, bot, data)
}

/** 将 Redis 消息快照恢复为插件可直接使用的框架消息对象。 */
export async function adaptMessageRecord (adapter, botOrId, record) {
  if (!record) return null
  const bot = typeof botOrId === "object" ? botOrId : Bot?.[botOrId]
  if (record.version !== MESSAGE_RECORD_VERSION) return adaptLegacyRecord(adapter, bot, record)
  if (record.direction === "outgoing") return adaptOutgoingRecord(adapter, bot, record)
  return adaptIncomingRecord(adapter, bot, record)
}
