import { applyUinMapping, getAppid, getMappedUin } from "./uinMap.js"
import { getGroupUin } from "./groupMap.js"
import {
  parseSceneExt,
  parseElementMessage,
  getElementBrief,
  saveMsgRecord,
  getRecordByMsgIdx,
  isReferenceMessageIndex,
} from "./messageStore.js"
import { sanitizeRawMessage } from "./messageRecord.js"
import { makeStreamReplyPayload } from "./streamMessage.js"

export async function makeMessage(adapter, id, event) {
  const officialMessageId = [event.id, event.message_id]
    .find(value => value && !isReferenceMessageIndex(value))
  const data = {
    raw: event,
    bot: Bot[id],
    self_id: id,
    post_type: event.post_type,
    message_type: event.message_type,
    sub_type: event.sub_type,
    /** 官方事件体 id 才是真实消息 ID；REFIDX/TMP 仅为引用索引。 */
    message_id: officialMessageId,
    get user_id () {
      return this.sender.user_id
    },
    message: [],
    raw_message: event.raw_message,
  }

  await buildMessageSegments(data, event, id)

  switch (data.message_type) {
    case "private":
      if (data.sub_type === "friend") {
        if (await makeFriendMessage(adapter, data, event)) return
      } else {
        await makeDirectMessage(adapter, data, event)
      }
      break
    case "group":
      await makeGroupMessage(adapter, data, event)
      break
    case "guild":
      await makeGuildMessage(adapter, data, event)
      break
    default:
      Bot.makeLog("warn", ["未知消息", event], id)
      return
  }

  Bot.em(`${data.post_type}.${data.message_type}.${data.sub_type}`, data)
}

async function buildMessageSegments(data, event, id) {
  if (Array.isArray(event.message))
    for (let i of event.message) {
      i = { ...i.data, type: i.type }
      switch (i.type) {
        case "at":
          await normalizeAtSegment(data, i, id)
          break
        case "forward":
          data.message.push(makeForwardSegment(i))
          continue
      }
      data.message.push(i)
    }

  if (Array.isArray(event.mentions)) {
    const existingIds = new Set(
      data.message
        .filter(m => m.type === "at")
        .flatMap(m => [m._raw_user_id, m.user_id, m.qq])
        .filter(Boolean)
        .map(String),
    )
    const fallbackMentions = []
    for (const m of event.mentions) {
      const isAll = m.scope === "all"
      const mentionId = isAll ? "all" : m.id || m.member_openid || m.user_openid
      if (!mentionId || existingIds.has(String(mentionId))) continue
      const atSeg = { type: "at", qq: mentionId, user_id: mentionId, username: m.username, is_you: m.is_you }
      await normalizeAtSegment(data, atSeg, id)
      fallbackMentions.push(atSeg)
      existingIds.add(String(mentionId))
    }
    data.message.unshift(...fallbackMentions)
  }
}

function makeForwardSegment(forward) {
  return {
    type: "node",
    title: forward.title,
    data: (Array.isArray(forward.nodes) ? forward.nodes : []).map(node => {
      const message = []
      if (node.content) message.push({ type: "text", text: node.content })
      if (Array.isArray(node.attachments))
        for (const attachment of node.attachments)
          message.push(makeForwardAttachmentSegment(attachment))
      if (Array.isArray(node.children) && node.children.length)
        message.push(makeForwardSegment({ nodes: node.children }))
      return {
        nickname: node.sender_name || "匿名消息",
        message,
      }
    }),
  }
}

function makeForwardAttachmentSegment(attachment) {
  const name = attachment.file_name || `${attachment.raw_type || "附件"}${attachment.index || ""}`
  if (!attachment.url) {
    const size = attachment.size_text ? `，大小：${attachment.size_text}` : ""
    return { type: "text", text: `[${attachment.raw_type || "附件"}：${name}${size}]` }
  }

  return {
    type: attachment.type || "file",
    file: attachment.url,
    url: attachment.url,
    name,
    ...(attachment.width ? { width: attachment.width } : {}),
    ...(attachment.height ? { height: attachment.height } : {}),
    ...(attachment.animated !== undefined ? { animated: attachment.animated } : {}),
  }
}

async function normalizeAtSegment(data, segment, id) {
  const isAll = segment.user_id === "all" || segment.qq === "all"
  const isSelf = (segment.is_you === true || segment.is_you === "true") && !isAll
  const rawUserId = String(isSelf ? id : segment.user_id || segment.qq || "")
  if (data.message_type === "group") {
    segment._raw_user_id = rawUserId
    segment.qq = await getMappedUin(getAppid(data.bot || id), rawUserId) || rawUserId
  } else {
    segment.qq = `qg_${rawUserId}`
  }
}

function normalizeGroupRole(event) {
  const role = event.author?.member_role || event.sender?.member_role || event.sender?.role
  if (role) return role

  const permissions = event.sender?.permissions
  if (Array.isArray(permissions)) {
    if (permissions.includes("owner")) return "owner"
    if (permissions.includes("admin")) return "admin"
    if (permissions.includes("member")) return "member"
  } else if (typeof permissions === "string") {
    return permissions
  }

  return undefined
}

function formatAtLog(segment) {
  const id = segment.qq || segment._raw_user_id || segment.user_id
  if (id === "all") return `@${segment.username || "全体成员"}`
  if (!segment.username) return `@${id}`
  return `@${segment.username}(${id})`
}

function formatStructuredMessageLog(message) {
  if (!message.every(segment => segment.type === "at" || segment.type === "text")) return
  return message
    .map(segment => segment.type === "at" ? formatAtLog(segment) : segment.text || "")
    .join("")
}

async function makeFriendMessage(adapter, data, event) {
  const rawOpenid = event.sender.user_id
  const nickname = event.author?.username || event.sender?.user_name
  data.sender = { user_id: rawOpenid, nickname }
  data._raw_user_id = rawOpenid

  data.reply = msg =>
    adapter.sendFriendMsg({ ...data, user_id: rawOpenid }, msg)
  data.streamReply = (payload, options) =>
    adapter.sendFriendStreamMsg(
      { ...data, user_id: rawOpenid },
      makeStreamReplyPayload(payload, data),
      options,
    )

  await applyUinMapping(data, rawOpenid)
  const senderName = data.sender.nickname ? `${data.sender.nickname}(${data.user_id})` : data.user_id
  Bot.makeLog("info", `好友消息：[${senderName}] ${data.raw_message}`, data.self_id)
  await adapter.setFriendMap(data)
  await attachReplyContext(data, event, "private")
  return false
}

async function makeGroupMessage(adapter, data, event) {
  const rawOpenid = event.sender.user_id
  const groupOpenid = event.group_id
  data._raw_user_id = rawOpenid
  const role = normalizeGroupRole(event)
  const nickname = event.author?.username || event.sender?.user_name
  data.sender = {
    user_id: rawOpenid,
    nickname,
    role,
    member_role: role,
    permissions: event.sender?.permissions,
    bot: event.author?.bot,
    union_openid: event.author?.union_openid,
    /** 兼容 oicq 的 member.is_owner / member.is_admin 鉴权 (loader.js filtPermission) */
    is_owner: role === "owner",
    is_admin: role === "owner" || role === "admin",
  }
  await applyUinMapping(data, rawOpenid)

  data.group_id = groupOpenid
  data._raw_group_id = groupOpenid
  const realGroupUin = await getGroupUin(data.bot || data.self_id, groupOpenid)
  if (realGroupUin) {
    data.group_id = realGroupUin
  }
  try {
    const group = await adapter.getGroupInfo(data, false, true)
    data.group_name = group.group_name
  } catch (err) {
    Bot.makeLog("debug", ["获取群基本信息失败", groupOpenid, err], data.self_id)
  }
  const messageLog = formatStructuredMessageLog(data.message) ?? data.raw_message
  const displayName = data.sender.nickname
  const senderName = displayName ? `${displayName}(${data.user_id})` : data.user_id
  const groupName = data.group_name ? `${data.group_name}(${data.group_id})` : data.group_id
  Bot.makeLog(
    "info",
    `群消息：[${groupName}, ${senderName}] ${messageLog}`,
    data.self_id,
  )

  data.reply = msg =>
    adapter.sendGroupMsg(
      {
        ...data,
        group_id: groupOpenid,
        user_id: rawOpenid,
      },
      msg,
    )
  data.recall = () =>
    adapter.recallGroupMsg({ ...data, group_id: groupOpenid }, data.message_id)
  await attachReplyContext(data, event, "group")
  await adapter.setGroupMap(data)
}

function makeStoredSender (data) {
  return {
    user_openid: String(data._raw_user_id || ""),
    ...(data.sender?.nickname ? { nickname: data.sender.nickname } : {}),
    ...(data.sender?.role ? { role: data.sender.role } : {}),
    ...(data.sender?.bot !== undefined ? { bot: data.sender.bot } : {}),
  }
}

async function saveIncomingRecord (data, event, scene) {
  const { msg_idx, ref_msg_idx } = parseSceneExt(event)
  return saveMsgRecord(data.bot || data.self_id, {
    direction: "incoming",
    scene,
    self_id: data.self_id,
    time: event.timestamp || event.time,
    message_id: data.message_id,
    msg_idx,
    ref_msg_idx,
    group_openid: scene === "group" ? data._raw_group_id : undefined,
    user_openid: scene === "private" ? data._raw_user_id : undefined,
    sender: makeStoredSender(data),
    message: sanitizeRawMessage(data.message),
    raw_message: data.raw_message,
    raw: sanitizeRawMessage(event),
  })
}

/** 持久化消息，并为带引用的群聊或好友私聊消息挂载 e.source / e.getReply()。 */
async function attachReplyContext (data, event, scene) {
  const { ref_msg_idx } = parseSceneExt(event)
  await saveIncomingRecord(data, event, scene)

  if (!ref_msg_idx) return
  const scope = scene === "private"
    ? { userOpenId: data._raw_user_id }
    : { groupOpenId: data._raw_group_id }
  const stored = await getRecordByMsgIdx(data.bot || data.self_id, ref_msg_idx, scope)
  if (stored?.message_id && !isReferenceMessageIndex(stored.message_id)) {
    data.source = {
      user_id: stored.user_id,
      time: stored.time,
      /** QQBot 无消息序号，以 message_id 顶替，配合 group.getChatHistory 查询持久化记录。 */
      seq: stored.message_id,
      rand: 1,
      message: stored.raw_message,
    }
    data.getReply = async () => stored
    return
  }

  /** 持久化记录未命中时，用事件自带的引用内容预览兜底，无 message_id 不可撤回。 */
  const elements = Array.isArray(event.msg_elements) ? event.msg_elements : []
  const el = elements.find(i => i?.msg_idx === ref_msg_idx) || elements[0]
  if (!el) return
  const message = parseElementMessage(el)
  if (!message.length) return
  const rawMessage = getElementBrief(el, message)
  const fallback = {
    message,
    raw_message: rawMessage,
    sender: {},
    time: event.timestamp,
    ...(scene === "private" ? { user_id: data.user_id } : { group_id: data.group_id }),
    msg_idx: ref_msg_idx,
  }
  data.source = {
    user_id: "",
    time: event.timestamp,
    rand: 1,
    message: rawMessage,
  }
  data.getReply = async () => fallback
}

async function makeDirectMessage(adapter, data, event) {
  data.sender = {
    ...data.bot.fl.get(`qg_${event.sender.user_id}`),
    ...event.sender,
    user_id: `qg_${event.sender.user_id}`,
    nickname: event.sender.user_name,
    avatar: event.author?.avatar,
    guild_id: event.guild_id,
    channel_id: event.channel_id,
    src_guild_id: event.src_guild_id,
  }
  Bot.makeLog(
    "info",
    `频道私聊消息：[${data.sender.nickname}(${data.user_id})] ${data.raw_message}`,
    data.self_id,
  )

  data.reply = msg =>
    adapter.sendDirectMsg(
      {
        ...data,
        user_id: event.user_id,
        guild_id: event.guild_id,
        channel_id: event.channel_id,
      },
      msg,
    )
  await adapter.setFriendMap(data)
}

async function makeGuildMessage(adapter, data, event) {
  data.message_type = "group"
  data.sender = {
    ...data.bot.fl.get(`qg_${event.sender.user_id}`),
    ...event.sender,
    user_id: `qg_${event.sender.user_id}`,
    nickname: event.sender.user_name,
    card: event.member?.nick,
    avatar: event.author?.avatar,
    src_guild_id: event.guild_id,
    src_channel_id: event.channel_id,
  }
  data.group_id = `qg_${event.guild_id}-${event.channel_id}`
  Bot.makeLog(
    "info",
    `频道消息：[${data.group_id}, ${data.sender.nickname}(${data.user_id})] ${data.raw_message}`,
    data.self_id,
  )
  data.reply = msg =>
    adapter.sendGuildMsg(
      {
        ...data,
        guild_id: event.guild_id,
        channel_id: event.channel_id,
      },
      msg,
    )
  await adapter.setFriendMap(data)
  await adapter.setGroupMap(data)
}
