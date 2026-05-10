import { Bot as QQBot } from "qq-group-bot"
export async function connectBot (adapter, token) {
  token = token.split(":")
  const id = token[0]
  const opts = {
    ...adapter.config.bot,
    appid: token[1],
    token: token[2],
    secret: token[3],
    intents: [
      "GUILDS",
      "GUILD_MEMBERS",
      "GUILD_MESSAGE_REACTIONS",
      "DIRECT_MESSAGE",
      "INTERACTION",
      "MESSAGE_AUDIT",
    ],
  }
  if (Number(token[4])) opts.intents.push("GROUP_AT_MESSAGE_CREATE", "C2C_MESSAGE_CREATE")
  if (Number(token[5])) opts.intents.push("GUILD_MESSAGES")
  else opts.intents.push("PUBLIC_GUILD_MESSAGES")
  Bot[id] = {
    adapter,
    sdk: new QQBot(opts),
    login () {
      return new Promise(resolve => {
        this.sdk.sessionManager.once("READY", resolve)
        this.sdk.start()
      })
    },
    logout () {
      return new Promise(resolve => {
        this.sdk.ws.once("close", resolve)
        this.sdk.stop()
      })
    },
    uin: id,
    info: {
      id,
      ...opts,
      // ✅ 修正：将 this.uin 改为 id
      avatar: `https://q.qlogo.cn/g?b=qq&s=0&nk=${id}`,
    },
    get nickname () {
      return this.info.username
    },
    get avatar () {
      return this.info.avatar
    },
    version: {
      id: adapter.id,
      name: adapter.name,
      version: adapter.version,
    },
    stat: { start_time: Date.now() / 1000 },
    pickFriend: user_id => adapter.pickFriend(id, user_id),
    get pickUser () {
      return this.pickFriend
    },
    getFriendMap () {
      return adapter.getFriendMap(id)
    },
    fl: await adapter.getFriendMap(id),
    pickMember: (group_id, user_id) => adapter.pickMember(id, group_id, user_id),
    pickGroup: group_id => adapter.pickGroup(id, group_id),
    getGroupMap () {
      return adapter.getGroupMap(id)
    },
    gl: await adapter.getGroupMap(id),
    gml: await adapter.getMemberMap(id),
    callback: {},
  }
  Bot[id].sdk.logger = {}
  for (const i of ["trace", "debug", "info", "mark", "warn", "error", "fatal"])
    Bot[id].sdk.logger[i] = (...args) => {
      if (args[0]?.startsWith?.("recv from") || args[0]?.startsWith?.("[CLIENT]")) return
      return Bot.makeLog(i, args, id)
    }

  try {
    await Bot[id].login()
    Object.assign(Bot[id].info, await Bot[id].sdk.getSelfInfo())
  } catch (err) {
    Bot.makeLog("error", [`${adapter.name}(${adapter.id}) ${adapter.version} 连接失败`, err], id)
    return false
  }

  // 事件处理（内部函数，依赖 adapter）
  const makeMessage = async (id, event) => {
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
      message: event.message,
      raw_message: event.raw_message,
    }

    for (const i of data.message)
      switch (i.type) {
        case "at":
          if (data.message_type === "group") i.qq = i.user_id
          else i.qq = `qg_${i.user_id}`
          break
      }

    switch (data.message_type) {
      case "private":
        if (data.sub_type === "friend") await makeFriendMessage(data, event)
        else await makeDirectMessage(data, event)
        break
      case "group":
        await makeGroupMessage(data, event)
        break
      case "guild":
        await makeGuildMessage(data, event)
        break
      default:
        Bot.makeLog("warn", ["未知消息", event], id)
        return
    }

    Bot.em(`${data.post_type}.${data.message_type}.${data.sub_type}`, data)
  }

  const makeFriendMessage = async (data, event) => {
    data.sender = {
      user_id: event.sender.user_id,
    }
    Bot.makeLog("info", `好友消息：[${data.user_id}] ${data.raw_message}`, data.self_id)

    data.reply = msg =>
      adapter.sendFriendMsg(
        {
          ...data,
          user_id: event.sender.user_id,
        },
        msg,
      )
    await adapter.setFriendMap(data)
  }

  const makeGroupMessage = async (data, event) => {
    data.sender = {
      user_id: event.sender.user_id,
    }
    data.group_id = event.group_id
    Bot.makeLog(
      "info",
      `群消息：[${data.group_id}, ${data.user_id}] ${data.raw_message}`,
      data.self_id,
    )

    data.reply = msg =>
      adapter.sendGroupMsg(
        {
          ...data,
          group_id: event.group_id,
        },
        msg,
      )
    data.message.unshift({ type: "at", qq: data.self_id })
    await adapter.setGroupMap(data)
  }

  const makeDirectMessage = async (data, event) => {
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

  const makeGuildMessage = async (data, event) => {
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

  const makeCallback = (id, event) => {
    const reply = event.reply.bind(event)
    event.reply = async (...args) => {
      try {
        return await reply(...args)
      } catch (err) {
        Bot.makeLog("debug", ["回复按钮点击事件错误", err], id)
      }
    }

    const data = {
      raw: event,
      bot: Bot[id],
      self_id: id,
      post_type: "message",
      message_id: event.event_id ? `event_${event.event_id}` : event.notice_id,
      message_type: event.notice_type,
      sub_type: "callback",
      get user_id () {
        return this.sender.user_id
      },
      sender: { user_id: event.operator_id },
      message: [],
      raw_message: "",
    }

    const callback = data.bot.callback[event.data?.resolved?.button_id]
    if (callback) {
      if (!event.group_id && callback.group_id) event.group_id = callback.group_id
      if (callback.message_id.length) {
        for (const id of callback.message_id) data.message.push({ type: "reply", id })
        data.raw_message += `[回复：${callback.message_id}]`
      }
      data.message.push({ type: "text", text: callback.message })
      data.raw_message += callback.message
    } else {
      if (event.data?.resolved?.button_id) {
        data.message.push({ type: "reply", id: event.data?.resolved?.button_id })
        data.raw_message += `[回复：${event.data?.resolved?.button_id}]`
      }
      if (event.data?.resolved?.button_data) {
        data.message.push({ type: "text", text: event.data?.resolved?.button_data })
        data.raw_message += event.data?.resolved?.button_data
      } else {
        event.reply(1)
      }
    }
    event.reply(0)

    switch (data.message_type) {
      case "friend":
        data.message_type = "private"
        Bot.makeLog("info", [`好友按钮点击事件：[${data.user_id}]`, data.raw_message], data.self_id)

        data.reply = msg => adapter.sendFriendMsg({ ...data, user_id: event.operator_id }, msg)
        adapter.setFriendMap(data)
        break
      case "group":
        data.group_id = event.group_id
        Bot.makeLog(
          "info",
          [`群按钮点击事件：[${data.group_id}, ${data.user_id}]`, data.raw_message],
          data.self_id,
        )

        data.reply = msg => adapter.sendGroupMsg({ ...data, group_id: event.group_id }, msg)
        adapter.setGroupMap(data)
        break
      case "guild": {
        data.message_type = "group"
        if (!event.guild_id && callback?.group_id?.startsWith?.("qg_")) {
          const [guild_id, channel_id] = callback.group_id.replace(/^qg_/, "").split("-")
          event.guild_id = guild_id
          event.channel_id = channel_id
        }
        data.group_id = `qg_${event.guild_id}-${event.channel_id}`
        data.sender = {
          ...data.bot.fl.get(`qg_${event.operator_id}`),
          user_id: `qg_${event.operator_id}`,
          src_guild_id: event.guild_id,
          src_channel_id: event.channel_id,
        }
        Bot.makeLog(
          "info",
          [`频道按钮点击事件：[${data.group_id}, ${data.user_id}]`, data.raw_message],
          data.self_id,
        )

        data.reply = msg => adapter.sendGuildMsg({ ...data, guild_id: event.guild_id, channel_id: event.channel_id }, msg)
        adapter.setFriendMap(data)
        adapter.setGroupMap(data)
        break
      }
      default:
        Bot.makeLog("warn", ["未知按钮点击事件", event], data.self_id)
    }

    Bot.em(`${data.post_type}.${data.message_type}.${data.sub_type}`, data)
  }

  const makeNotice = (id, event) => {
    const data = {
      raw: event,
      bot: Bot[id],
      self_id: id,
      post_type: event.post_type,
      notice_type: event.notice_type,
      sub_type: event.sub_type,
      notice_id: event.notice_id,
    }

    switch (data.sub_type) {
      case "action":
        return makeCallback(id, event)
      case "increase":
      case "decrease":
      case "update":
      case "member.increase":
      case "member.decrease":
      case "member.update":
        break
      default:
        Bot.makeLog("warn", ["未知通知", event], id)
        return
    }

    //Bot.em(`${data.post_type}.${data.notice_type}.${data.sub_type}`, data)
  }

  Bot[id].sdk.on("message", event => makeMessage(id, event))
  Bot[id].sdk.on("notice", event => makeNotice(id, event))

  Bot.makeLog("mark", `${adapter.name}(${adapter.id}) ${adapter.version} ${Bot[id].nickname} 已连接`, id)
  Bot.em(`connect.${id}`, { self_id: id })
  return true
}
