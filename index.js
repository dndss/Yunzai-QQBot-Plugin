logger.info(logger.yellow("- 正在加载 QQBot 适配器插件"))
// 动态导入子模块（避免子目录 .js 被 CJS 解析）
const { config } = await import("./lib/config.js")
const { Converter } = await import("./lib/converter.js")
const { connectBot } = await import("./lib/client.js")
const { isQQUin, loadMappingsFromFile, translateToOpenid } = await import("./lib/uinMap.js")
const {
  loadMappingsFromFile: loadGroupMappings,
  translateGroupToOpenid,
} = await import("./lib/groupMap.js")
const { installMessageSender } = await import("./lib/messageSender.js")
const { getRecordByMsgId } = await import("./lib/msgIdxCache.js")
const adapter = new (class QQBotAdapter {
  constructor() {
    this.id = "QQBot"
    this.name = "QQBot"
    this.path = "data/QQBot/"
    this.version = "qq-official-bot fork v1.2.3-dndss.1"
    this.sep = ":"
    if (process.platform === "win32") this.sep = ""
    this.converter = new Converter(this)
    this.config = config
    installMessageSender(this)
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

  /** 按 Yunzai 群对象格式获取 QQ OpenAPI 群基本信息 */
  async getGroupInfo(data, no_cache = false, add = false) {
    const group_id = String(data.group_id)
    const cached = data.bot.gl.get(group_id)
    if (!no_cache && cached?.group_name && cached?.member_role) return cached

    let group_openid = data._raw_group_id
    if (!group_openid || group_openid === group_id)
      group_openid = await translateGroupToOpenid(data.bot, group_id) || group_id

    const [raw, { member_role }] = await Promise.all([
      data.bot.sdk.getGroupInfo(group_openid),
      data.bot.sdk.getGroupBotState(group_openid),
    ])
    const info = {
      ...raw,
      group_id,
      group_name: raw.group_name,
      group_openid: raw.group_openid || group_openid,
      _raw_group_id: raw.group_openid || group_openid,
      member_count: raw.group_member_num,
      member_role,
    }
    if (add || data.bot.gl.has(group_id)) await data.bot.gl.set(group_id, info)
    return info
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
      /** 发送一个 C2C 流式消息分片；调用方负责维护 index 和 stream_msg_id */
      sendStreamMsg: (payload, options) => this.sendFriendStreamMsg(i, payload, options),
      getMsg: message_id => getRecordByMsgId(id, message_id),
      recallMsg: message_id => this.recallFriendMsg(i, message_id),
      getAvatarUrl: (size = 100) => {
        const userId = i._raw_user_id || i.user_id
        if (isQQUin(userId))
          return `https://q.qlogo.cn/g?b=qq&nk=${userId}&s=${size}`
        return `https://q.qlogo.cn/qqapp/${i.bot.info.appid}/${userId}/0`
      },
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
      getAvatarUrl: size => this.pickFriend(id, i._raw_user_id || user_id).getAvatarUrl(size),
      /** 按 Yunzai 成员对象约定禁言当前成员 */
      mute: seconds => this.pickGroup(id, group_id).muteMember(user_id, seconds),
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
    const memberRole = i.member_role
    return {
      ...i,
      is_owner: memberRole === "owner",
      is_admin: memberRole === "admin" || memberRole === "owner",
      sendMsg: msg => this.sendGroupMsg(i, msg),
      getMsg: message_id => getRecordByMsgId(id, message_id),
      recallMsg: message_id => this.recallGroupMsg(i, message_id),
      getInfo: (no_cache, add) => this.getGroupInfo(i, no_cache, add),
      pickMember: user_id => this.pickMember(id, group_id, user_id),
      getMemberMap: () => i.bot.gml.get(group_id),
      /** 按 Yunzai 约定以秒为单位禁言群成员，传 0 解除禁言 */
      muteMember: async (user_id, seconds) => {
        const groupOpenid = await translateGroupToOpenid(i.bot, i.group_id) || i._raw_group_id || i.group_id
        const memberOpenid = await translateToOpenid(i.bot, String(user_id))
        const duration = Number(seconds)
        if (!Number.isFinite(duration) || duration < 0)
          throw new TypeError("禁言时长必须是大于或等于 0 的秒数")

        if (duration === 0) {
          return i.bot.sdk.setGroupMemberMuteState(groupOpenid, [{
            op: "del",
            member_openid: memberOpenid,
            mute_expire_at: "",
          }])
        }

        const setting = await i.bot.sdk.getGroupRestrictChatSetting(groupOpenid)
        const muted = setting.members?.some(member => member.member_openid === memberOpenid)
        return i.bot.sdk.setGroupMemberMuteState(groupOpenid, [{
          op: muted ? "update" : "add",
          member_openid: memberOpenid,
          mute_expire_at: new Date(Date.now() + duration * 1000).toISOString(),
        }])
      },
      /** QQBot 无拉取历史消息接口，以 message_id 作为 seq 查本地消息缓存 */
      getChatHistory: async (seq, cnt = 1) => {
        const record = await getRecordByMsgId(id, seq)
        return record ? [record] : []
      },
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
export { QRLoginPlugin } from "./app/qrlogin.js"
logger.info(logger.green("- QQBot 适配器插件 加载完成"))
