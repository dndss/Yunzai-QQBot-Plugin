import { translateToOpenid } from "./uinMap.js"
import { getGroupUin, translateGroupToOpenid } from "./groupMap.js"
import { deleteMsgRecord, saveMsgRecord } from "./msgIdxCache.js"
import { cacheRemoteFileMessage, cleanupCachedFiles } from "./fileCache.js"
import { MESSAGE_RECORD_VERSION, sanitizeRawMessage } from "./messageRecord.js"

/** 被动回复限制：同一 msg_id/event_id 最多被动回复的消息条数，超出后自动转为主动消息 */
const REPLY_LIMIT = 5
/** 被动消息有效期，单位毫秒 */
const REPLY_EXPIRE = 300000
/** QQ OpenAPI：Markdown 图片资源转存失败 */
const MARKDOWN_IMAGE_TRANSFER_ERROR = 304010
/** 记录每个 msg_id/event_id 已使用的被动回复条数 */
const replyCounts = new Map()

function getOpenApiErrorCode (error) {
  const code = Number(
    error?.err_code ??
    error?.code ??
    error?.response?.data?.err_code ??
    error?.response?.data?.code,
  )
  if (Number.isSafeInteger(code)) return code
  const matched = String(error?.message || error).match(/\bcode\((\d+)\)/)
  return matched ? Number(matched[1]) : undefined
}

function isMarkdownImageTransferError (error) {
  return getOpenApiErrorCode(error) === MARKDOWN_IMAGE_TRANSFER_ERROR
}

function getReplyKey(self_id, replySeg) {
  const id = replySeg?.data?.id || replySeg?.data?.event_id
  return id ? `${self_id}:${id}` : undefined
}

function getReplyCount(key) {
  return replyCounts.get(key)?.count || 0
}

function addReplyCount(key) {
  const entry = replyCounts.get(key)
  if (entry) entry.count++
  else {
    replyCounts.set(key, { count: 1 })
    setTimeout(() => replyCounts.delete(key), REPLY_EXPIRE)
  }
}

function normalizeSentMessage (message) {
  const source = Array.isArray(message) ? message : [message]
  return source.map(segment => {
    if (typeof segment !== "object" || !segment)
      return { type: "text", text: Bot.String(segment) }
    if (typeof segment.data === "object" && segment.data && !Array.isArray(segment.data))
      return { ...segment.data, type: segment.type }
    return { ...segment }
  })
}

function getSentRawMessage (message, brief = "") {
  const source = Array.isArray(message) ? message : [message]
  const raw = source.map(segment => {
    if (typeof segment !== "object" || !segment) return Bot.String(segment)
    switch (segment.type) {
      case "text":
        return segment.data?.text || ""
      case "markdown":
        return segment.data?.content || ""
      case "at":
        return `<@${segment.data?.user_id || ""}>`
      case "face":
        return `<face,id=${segment.data?.id || ""}>`
      case "image":
        return "[图片]"
      case "audio":
        return "[语音]"
      case "video":
        return "[视频]"
      case "file":
        return `[文件：${segment.data?.name || ""}]`
      default:
        return ""
    }
  }).join("")
  return raw || brief
}

export function installMessageSender(adapter) {
  const sendMsgs = async (data, send, fullMsgs, prepareMessage, onSent) => {
    const rets = { message_id: [], data: [], error: [] }

    const recordSent = async (ret, sentMessage, usedReply, replyKey) => {
      Bot.makeLog("debug", ["发送消息返回", ret], data.self_id)
      rets.data.push(ret)
      if (ret.id) rets.message_id.push(ret.id)
      if (usedReply && replyKey) addReplyCount(replyKey)
      if (onSent) {
        try {
          await onSent(ret, sentMessage)
        } catch (err) {
          Bot.makeLog("error", ["已发送消息缓存写入失败", ret, err], data.self_id)
        }
      }
    }

    for (const full of fullMsgs) {
      let prepared = full
      let cachedFiles = []
      if (prepareMessage) {
        try {
          const result = await prepareMessage(full)
          prepared = result.message
          cachedFiles = result.cachedFiles
        } catch (err) {
          Bot.makeLog("error", ["发送文件准备失败", full, err], data.self_id)
          rets.error.push(err)
          continue
        }
      }

      const hasReply = Array.isArray(prepared) && prepared[0]?.type === "reply"
      const replyKey = hasReply ? getReplyKey(data.self_id, prepared[0]) : undefined
      let i = prepared
      let usedReply = hasReply
      // 超出被动回复限制，自动转为主动消息
      if (hasReply && replyKey && getReplyCount(replyKey) >= REPLY_LIMIT) {
        Bot.makeLog("info", `被动回复已达上限(${REPLY_LIMIT})，转为主动消息发送`, data.self_id)
        i = prepared.slice(1)
        usedReply = false
      }

      try {
        Bot.makeLog("debug", ["发送消息", i], data.self_id)
        const ret = await send(i)
        await recordSent(ret, prepared, usedReply, replyKey)
      } catch (err) {
        if (
          adapter.config.forceVerifyImageResource === true &&
          isMarkdownImageTransferError(err)
        ) {
          try {
            const refreshed = await adapter.converter.refreshMarkdownImages(data, full)
            if (refreshed) {
              Bot.makeLog("warn", "Markdown 图片转存失败，正在刷新图片 URL 后重发", data.self_id)
              prepared = refreshed
              if (prepareMessage) {
                const result = await prepareMessage(refreshed)
                prepared = result.message
                cachedFiles.push(...result.cachedFiles)
              }

              const retryHasReply = Array.isArray(prepared) && prepared[0]?.type === "reply"
              const retryReplyKey = retryHasReply ? getReplyKey(data.self_id, prepared[0]) : undefined
              i = prepared
              usedReply = retryHasReply
              if (retryHasReply && retryReplyKey && getReplyCount(retryReplyKey) >= REPLY_LIMIT) {
                i = prepared.slice(1)
                usedReply = false
              }

              Bot.makeLog("debug", ["重新发送消息", i], data.self_id)
              const ret = await send(i)
              await recordSent(ret, prepared, usedReply, retryReplyKey)
              continue
            }
          } catch (retryError) {
            err = retryError
          }
        }

        if (usedReply && !isMarkdownImageTransferError(err)) {
          Bot.makeLog("warn", "回复发送失败正在转为主动消息重发", data.self_id)
          try {
            const ret = await send(prepared.slice(1))
            await recordSent(ret, prepared.slice(1), false)
            continue
          } catch (err2) {
            err = err2
          }
        }
        Bot.makeLog("error", ["发送消息错误", i, err], data.self_id)
        rets.error.push(err)
      } finally {
        await cleanupCachedFiles(cachedFiles)
      }
    }
    return rets
  }

  adapter.sendMsg = async (data, send, msg, onSent) => {
    const rets = await sendMsgs(
      data,
      send,
      await adapter.converter.makeRawMarkdownMsg(data, msg),
      cacheRemoteFileMessage,
      onSent,
    )
    if (Array.isArray(data._ret_id)) data._ret_id.push(...rets.message_id)
    return rets
  }

  adapter.sendFriendMsg = async (data, msg) => {
    const user_id = await translateToOpenid(data.bot || data.self_id, String(data.user_id).replace(`${data.self_id}${adapter.sep}`, ""))
    return adapter.sendMsg({ ...data, user_id }, msg => data.bot.sdk.sendPrivateMessage(user_id, msg), msg)
  }

  adapter.sendGroupMsg = async (data, msg) => {
    let group_id = String(data.group_id).replace(`${data.self_id}${adapter.sep}`, "")
    if (/^\d{5,15}$/.test(group_id)) {
      const openid = await translateGroupToOpenid(data.bot || data.self_id, group_id)
      if (openid) group_id = openid
    }
    const user_id = data.user_id ? await translateToOpenid(data.bot || data.self_id, String(data.user_id).replace(`${data.self_id}${adapter.sep}`, "")) : data.user_id
    return adapter.sendMsg(
      { ...data, group_id, user_id },
      msg => data.bot.sdk.sendGroupMessage(group_id, msg),
      msg,
      async (ret, sentMessage) => {
        const msgIdx = ret.ext_info?.ref_idx
        if (!msgIdx || !ret.id) return
        const mappedGroupId = await getGroupUin(data.bot || data.self_id, group_id)
        await saveMsgRecord(data.bot || data.self_id, {
          version: MESSAGE_RECORD_VERSION,
          direction: "outgoing",
          scene: "group",
          self_id: data.self_id,
          msg_idx: msgIdx,
          message_id: ret.id,
          raw: sanitizeRawMessage(ret),
          payload: {
            message: sanitizeRawMessage(normalizeSentMessage(sentMessage)),
            raw_message: getSentRawMessage(sentMessage, ret.brief),
          },
          context: {
            user_id: data.self_id,
            raw_user_id: data.bot.info?.id,
            group_id: mappedGroupId || data.group_id,
            raw_group_id: group_id,
            nickname: data.bot.nickname,
          },
        })
      },
    )
  }

  adapter.sendGMsg = async (data, send, msg) =>
    sendMsgs(data, send, await adapter.converter.makeGuildMsg(data, msg))

  adapter.sendDirectMsg = async (data, msg) => {
    if (!data.guild_id) {
      if (!data.src_guild_id) {
        Bot.makeLog(
          "error",
          [`发送频道私聊消息失败：[${data.user_id}] 不存在来源频道信息`, msg],
          data.self_id,
        )
        return false
      }
      const dms = await data.bot.sdk.createDirectSession(data.src_guild_id, data.user_id)
      data.guild_id = dms.guild_id
      data.channel_id = dms.channel_id
      data.bot.fl.set(`qg_${data.user_id}`, {
        ...data.bot.fl.get(`qg_${data.user_id}`),
        ...dms,
      })
    }
    return adapter.sendGMsg(data, msg => data.bot.sdk.sendDirectMessage(data.guild_id, msg), msg)
  }

  adapter.sendGuildMsg = (data, msg) => {
    return adapter.sendGMsg(data, msg => data.bot.sdk.sendGuildMessage(data.channel_id, msg), msg)
  }

  adapter.recallMsg = async (data, recall, message_id) => {
    if (!Array.isArray(message_id)) message_id = [message_id]
    const msgs = []
    for (const i of message_id)
      try {
        msgs.push(await recall(i))
      } catch (err) {
        Bot.makeLog("debug", ["撤回消息错误", i, err], data.self_id)
        msgs.push(false)
      }
    return msgs
  }

  adapter.recallFriendMsg = (data, message_id) => {
    Bot.makeLog("info", `撤回好友消息：[${data.user_id}] ${message_id}`, data.self_id)
    return adapter.recallMsg(data, i => data.bot.sdk.recallFriendMessage(data.user_id, i), message_id)
  }

  adapter.recallGroupMsg = async (data, message_id) => {
    let group_id = String(data.group_id).replace(`${data.self_id}${adapter.sep}`, "")
    if (/^\d{5,15}$/.test(group_id)) {
      const openid = await translateGroupToOpenid(data.bot || data.self_id, group_id)
      if (openid) group_id = openid
    }
    Bot.makeLog("info", `撤回群消息：[${group_id}] ${message_id}`, data.self_id)
    const ids = Array.isArray(message_id) ? message_id : [message_id]
    const rets = await adapter.recallMsg(data, i => data.bot.sdk.recallGroupMessage(group_id, i), message_id)
    // 撤回成功的消息清除本地缓存，使 getMsg / 引用查询不再返回已撤回的消息
    for (const [idx, ret] of rets.entries())
      if (ret !== false) await deleteMsgRecord(data.bot || data.self_id, ids[idx])
    return rets
  }

  adapter.recallDirectMsg = (data, message_id, hide = adapter.config.hideGuildRecall) => {
    Bot.makeLog("info", `撤回${hide ? "并隐藏" : ""}频道私聊消息：[${data.guild_id}] ${message_id}`, data.self_id)
    return adapter.recallMsg(data, i => data.bot.sdk.recallDirectMessage(data.guild_id, i, hide), message_id)
  }

  adapter.recallGuildMsg = (data, message_id, hide = adapter.config.hideGuildRecall) => {
    Bot.makeLog("info", `撤回${hide ? "并隐藏" : ""}频道消息：[${data.channel_id}] ${message_id}`, data.self_id)
    return adapter.recallMsg(data, i => data.bot.sdk.recallGuildMessage(data.channel_id, i, hide), message_id)
  }
}
