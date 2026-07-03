import { applyUinMapping, getAppid, getMappedUin } from "./uinMap.js"
import { getGroupUin } from "./groupMap.js"
import { getGroupMemberInfo } from "./groupMember.js"

export async function makeMessage(adapter, id, event) {
  const data = {
    raw: event,
    bot: Bot[id],
    self_id: id,
    post_type: event.post_type,
    message_type: event.message_type,
    sub_type: event.sub_type,
    message_id: event.message_id,
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

function normalizeGroupRole(event, memberInfo) {
  const role = memberInfo?.member_role || event.author?.member_role || event.sender?.member_role || event.sender?.role
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

  await applyUinMapping(data, rawOpenid)
  const senderName = data.sender.nickname ? `${data.sender.nickname}(${data.user_id})` : data.user_id
  Bot.makeLog("info", `好友消息：[${senderName}] ${data.raw_message}`, data.self_id)
  await adapter.setFriendMap(data)
  return false
}

async function makeGroupMessage(adapter, data, event) {
  const rawOpenid = event.sender.user_id
  const groupOpenid = event.group_id
  data._raw_user_id = rawOpenid
  const memberInfo = await getGroupMemberInfo(data.bot, groupOpenid, rawOpenid)
  const role = normalizeGroupRole(event, memberInfo)
  const nickname = event.author?.username || event.sender?.user_name
  data.sender = {
    user_id: rawOpenid,
    nickname,
    ...(memberInfo?.username ? { card: memberInfo.username } : {}),
    role,
    member_role: role,
    permissions: event.sender?.permissions,
    ...(memberInfo
      ? {
          bot: memberInfo.bot,
          join_time: memberInfo.join_time,
          joined_at: memberInfo.joined_at,
          union_openid: memberInfo.union_openid,
        }
      : {}),
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
  const messageLog = formatStructuredMessageLog(data.message) ?? data.raw_message
  const displayName = data.sender.card || data.sender.nickname
  const senderName = displayName ? `${displayName}(${data.user_id})` : data.user_id
  Bot.makeLog(
    "info",
    `群消息：[${data.group_id}, ${senderName}] ${messageLog}`,
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
  await adapter.setGroupMap(data)
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
