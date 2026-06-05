logger.info(logger.yellow("- 正在加载 QQBot 适配器插件"))
// 动态导入子模块（避免子目录 .js 被 CJS 解析）
const { config } = await import("./lib/config.js")
const { Converter } = await import("./lib/converter.js")
const { connectBot } = await import("./lib/client.js")
const { translateToOpenid, loadMappingsFromFile } = await import("./lib/uinMap.js")
const { translateGroupToOpenid, loadMappingsFromFile: loadGroupMappings } = await import("./lib/groupMap.js")
const adapter = new (class QQBotAdapter {
  constructor() {
    this.id = "QQBot"
    this.name = "QQBot"
    this.path = "data/QQBot/"
    this.version = "qq-official-bot v1.2.1"
    this.sep = ":"
    if (process.platform === "win32") this.sep = ""
    this.converter = new Converter(this)
    this.config = config
  }

  getFriendMap(id) {
    return Bot.getMap(`${this.path}${id}/Friend`)
  }
  getGroupMap(id) {
    return Bot.getMap(`${this.path}${id}/Group`)
  }
  getMemberMap(id) {
    return Bot.getMap(`${this.path}${id}/Member`)
  }

  async setFriendMap(data) {
    if (!data.user_id) return
    await data.bot.fl.set(data.user_id, {
      ...data.bot.fl.get(data.user_id),
      ...data.sender,
      message_id: data.message_id,
    })
  }

  async setGroupMap(data) {
    if (!data.group_id) return
    await data.bot.gl.set(data.group_id, {
      ...data.bot.gl.get(data.group_id),
      group_id: data.group_id,
      message_id: data.message_id,
    })
    let gml = data.bot.gml.get(data.group_id)
    if (!gml) {
      gml = new Map()
      await data.bot.gml.set(data.group_id, gml)
    }
    await gml.set(data.user_id, {
      ...gml.get(data.user_id),
      ...data.sender,
    })
  }

  pickFriend(id, user_id) {
    if (typeof user_id !== "string") user_id = String(user_id)
    else if (user_id.startsWith("qg_")) return this.pickGuildFriend(id, user_id)
    const i = {
      ...Bot[id].fl.get(user_id),
      self_id: id,
      bot: Bot[id],
      user_id: user_id.replace(`${id}${this.sep}`, ""),
    }
    return {
      ...i,
      sendMsg: msg => this.sendFriendMsg(i, msg),
      recallMsg: message_id => this.recallFriendMsg(i, message_id),
      getAvatarUrl: () => `https://q.qlogo.cn/qqapp/${i.bot.info.appid}/${i.user_id}/0`,
    }
  }

  pickMember(id, group_id, user_id) {
    if (typeof group_id !== "string") group_id = String(group_id)
    if (typeof user_id !== "string") user_id = String(user_id)
    else if (user_id.startsWith("qg_")) return this.pickGuildMember(id, group_id, user_id)
    const i = {
      ...Bot[id].fl.get(user_id),
      ...Bot[id].gml.get(group_id)?.get(user_id),
      self_id: id,
      bot: Bot[id],
      user_id: user_id.replace(`${id}${this.sep}`, ""),
      group_id: group_id.replace(`${id}${this.sep}`, ""),
    }
    return {
      ...this.pickFriend(id, user_id),
      ...i,
    }
  }

  pickGroup(id, group_id) {
    if (typeof group_id !== "string") group_id = String(group_id)
    else if (group_id.startsWith("qg_")) return this.pickGuild(id, group_id)
    const i = {
      ...Bot[id].gl.get(group_id),
      self_id: id,
      bot: Bot[id],
      group_id: group_id.replace(`${id}${this.sep}`, ""),
    }
    return {
      ...i,
      sendMsg: msg => this.sendGroupMsg(i, msg),
      recallMsg: message_id => this.recallGroupMsg(i, message_id),
      pickMember: user_id => this.pickMember(id, group_id, user_id),
      getMemberMap: () => i.bot.gml.get(group_id),
    }
  }

  pickGuildFriend(id, user_id) {
    const i = {
      ...Bot[id].fl.get(user_id),
      self_id: id,
      bot: Bot[id],
      user_id: user_id.replace(/^qg_/, ""),
    }
    return {
      ...i,
      sendMsg: msg => this.sendDirectMsg(i, msg),
      recallMsg: (message_id, hide) => this.recallDirectMsg(i, message_id, hide),
    }
  }

  pickGuildMember(id, group_id, user_id) {
    const guild_id = group_id.replace(/^qg_/, "").split("-")
    const i = {
      ...Bot[id].fl.get(user_id),
      ...Bot[id].gml.get(group_id)?.get(user_id),
      self_id: id,
      bot: Bot[id],
      src_guild_id: guild_id[0],
      src_channel_id: guild_id[1],
      user_id: user_id.replace(/^qg_/, ""),
    }
    return {
      ...this.pickGuildFriend(id, user_id),
      ...i,
      sendMsg: msg => this.sendDirectMsg(i, msg),
      recallMsg: (message_id, hide) => this.recallDirectMsg(i, message_id, hide),
    }
  }

  pickGuild(id, group_id) {
    const guild_id = group_id.replace(/^qg_/, "").split("-")
    const i = {
      ...Bot[id].gl.get(group_id),
      self_id: id,
      bot: Bot[id],
      guild_id: guild_id[0],
      channel_id: guild_id[1],
    }
    return {
      ...i,
      sendMsg: msg => this.sendGuildMsg(i, msg),
      recallMsg: (message_id, hide) => this.recallGuildMsg(i, message_id, hide),
      pickMember: user_id => this.pickGuildMember(id, group_id, user_id),
      getMemberMap: () => i.bot.gml.get(group_id),
    }
  }

  async sendMsg(data, send, msg) {
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

    // 生成完整消息（插件通过 segment.reply() 添加的回复引用会正常生成）
    const fullMsgs = await this.converter.makeRawMarkdownMsg(data, msg)

    // 第一发：剥离回复引用，以主动消息发送
    let msgs = fullMsgs.map(m => {
      if (Array.isArray(m) && m[0]?.type === "reply") return m.slice(1)
      return m
    })

    if ((await sendMsgIter()) === false) {
      // 主动失败，回滚到带回复引用的 Markdown 消息
      msgs = fullMsgs
      await sendMsgIter()
    }

    if (Array.isArray(data._ret_id)) data._ret_id.push(...rets.message_id)
    return rets
  }

  async sendFriendMsg(data, msg) {
    const user_id = await translateToOpenid(data.bot || data.self_id, String(data.user_id).replace(`${data.self_id}${this.sep}`, ""))
    return this.sendMsg({ ...data, user_id }, msg => data.bot.sdk.sendPrivateMessage(user_id, msg), msg)
  }

  async sendGroupMsg(data, msg) {
    let group_id = String(data.group_id).replace(`${data.self_id}${this.sep}`, "")
    // 反向映射：真实群号 → OpenID（SDK 发消息必须用 OpenID）
    if (/^\d{5,15}$/.test(group_id)) {
      const openid = await translateGroupToOpenid(data.bot || data.self_id, group_id)
      if (openid) group_id = openid
    }
    const user_id = data.user_id ? await translateToOpenid(data.bot || data.self_id, String(data.user_id).replace(`${data.self_id}${this.sep}`, "")) : data.user_id
    return this.sendMsg({ ...data, group_id, user_id }, msg => data.bot.sdk.sendGroupMessage(group_id, msg), msg)
  }

  async sendGMsg(data, send, msg) {
    const rets = { message_id: [], data: [], error: [] }
    // 生成完整消息（插件通过 segment.reply() 添加的回复引用会正常生成）
    const fullMsgs = await this.converter.makeGuildMsg(data, msg)
    // 第一发：剥离回复引用，以主动消息发送
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
      // 主动失败，回滚到带回复引用的频道消息
      msgs = fullMsgs
      await sendMsgIter()
    }
    return rets
  }

  async sendDirectMsg(data, msg) {
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
    return this.sendGMsg(data, msg => data.bot.sdk.sendDirectMessage(data.guild_id, msg), msg)
  }

  sendGuildMsg(data, msg) {
    return this.sendGMsg(data, msg => data.bot.sdk.sendGuildMessage(data.channel_id, msg), msg)
  }

  async recallMsg(data, recall, message_id) {
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

  recallFriendMsg(data, message_id) {
    Bot.makeLog("info", `撤回好友消息：[${data.user_id}] ${message_id}`, data.self_id)
    return this.recallMsg(data, i => data.bot.sdk.recallFriendMessage(data.user_id, i), message_id)
  }
  async recallGroupMsg(data, message_id) {
    let group_id = String(data.group_id).replace(`${data.self_id}${this.sep}`, "")
    // 反向映射：真实群号 → OpenID（SDK 撤回必须用 OpenID）
    if (/^\d{5,15}$/.test(group_id)) {
      const openid = await translateGroupToOpenid(data.bot || data.self_id, group_id)
      if (openid) group_id = openid
    }
    Bot.makeLog("info", `撤回群消息：[${group_id}] ${message_id}`, data.self_id)
    return this.recallMsg(data, i => data.bot.sdk.recallGroupMessage(group_id, i), message_id)
  }
  recallDirectMsg(data, message_id, hide = config.hideGuildRecall) {
    Bot.makeLog("info", `撤回${hide ? "并隐藏" : ""}频道私聊消息：[${data.guild_id}] ${message_id}`, data.self_id)
    return this.recallMsg(data, i => data.bot.sdk.recallDirectMessage(data.guild_id, i, hide), message_id)
  }
  recallGuildMsg(data, message_id, hide = config.hideGuildRecall) {
    Bot.makeLog("info", `撤回${hide ? "并隐藏" : ""}频道消息：[${data.channel_id}] ${message_id}`, data.self_id)
    return this.recallMsg(data, i => data.bot.sdk.recallGuildMessage(data.channel_id, i, hide), message_id)
  }

  async connect(token) {
    return connectBot(this, token)
  }

  async load() {
    await loadMappingsFromFile()
    await loadGroupMappings()
    for (const token of config.token) {
      await connectBot(this, token)
      await Bot.sleep(500)
    }
  }
})()
Bot.adapter.push(adapter)
await import("./app/bind.js")
await import("./app/groupBind.js")
await import("./app/qrlogin.js")
logger.info(logger.green("- QQBot 适配器插件 加载完成"))
