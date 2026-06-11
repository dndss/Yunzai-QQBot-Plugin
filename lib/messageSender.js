import { translateToOpenid } from "./uinMap.js"
import { translateGroupToOpenid } from "./groupMap.js"

export function installMessageSender(adapter) {
  adapter.sendMsg = async (data, send, msg) => {
    const rets = { message_id: [], data: [], error: [] }

    const sendMsgIter = async () => {
      for (const i of msgs)
        try {
          Bot.makeLog("debug", ["发送消息", i], data.self_id)
          const ret = await send(i)
          Bot.makeLog("debug", ["发送消息返回", ret], data.self_id)
          rets.data.push(ret)
          if (ret.id) rets.message_id.push(ret.id)
        } catch (err) {
          Bot.makeLog("error", ["发送消息错误", i, err], data.self_id)
          rets.error.push(err)
          return false
        }
    }

    const fullMsgs = await adapter.converter.makeRawMarkdownMsg(data, msg)
    let msgs = fullMsgs.map(m => {
      if (Array.isArray(m) && m[0]?.type === "reply") return m.slice(1)
      return m
    })

    if ((await sendMsgIter()) === false) {
      msgs = fullMsgs
      await sendMsgIter()
    }

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
    return adapter.sendMsg({ ...data, group_id, user_id }, msg => data.bot.sdk.sendGroupMessage(group_id, msg), msg)
  }

  adapter.sendGMsg = async (data, send, msg) => {
    const rets = { message_id: [], data: [], error: [] }
    const fullMsgs = await adapter.converter.makeGuildMsg(data, msg)
    let msgs = fullMsgs.map(m => {
      if (Array.isArray(m) && m[0]?.type === "reply") return m.slice(1)
      return m
    })
    const sendMsgIter = async () => {
      for (const i of msgs)
        try {
          Bot.makeLog("debug", ["发送消息", i], data.self_id)
          const ret = await send(i)
          Bot.makeLog("debug", ["发送消息返回", ret], data.self_id)
          rets.data.push(ret)
          if (ret.id) rets.message_id.push(ret.id)
        } catch (err) {
          Bot.makeLog("error", ["发送消息错误", i, err], data.self_id)
          rets.error.push(err)
          return false
        }
    }
    if ((await sendMsgIter()) === false) {
      msgs = fullMsgs
      await sendMsgIter()
    }
    return rets
  }

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
    return adapter.recallMsg(data, i => data.bot.sdk.recallGroupMessage(group_id, i), message_id)
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
