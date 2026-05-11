import { consumeBindSession, createBindSession, getAppid, isQQUin, saveMapping, verifyAvatar } from "../lib/uinMap.js"

export class qqbotUinBind extends plugin {
  constructor () {
    super({
      name: "QQBot账号绑定",
      dsc: "绑定官方QQBot openid 与真实QQ号",
      event: "message",
      priority: 1,
      rule: [
        {
          reg: "^#QQ绑定$",
          fnc: "startBind",
          log: true
        },
        {
          reg: "^\\d{5,12}$",
          fnc: "finishBind",
          log: false
        }
      ]
    })
  }

  getRawOpenid () {
    return this.e?._raw_user_id || this.e?.sender?._raw_user_id || this.e?.user_id
  }

  isQQBotFriendMessage () {
    const openid = this.getRawOpenid()
    return this.e?.message_type === "private" && this.e?.sub_type === "friend" && openid && !String(openid).startsWith("qg_")
  }

  async startBind () {
    if (!this.isQQBotFriendMessage()) return false
    return this.handleBind()
  }

  async finishBind () {
    if (!this.isQQBotFriendMessage()) return false
    return this.handleBind()
  }

  async handleBind () {
    const rawOpenid = this.getRawOpenid()
    const appid = getAppid(this.e.bot || this.e.self_id)
    const text = String(this.e.raw_message || "").trim()
    if (!appid || !rawOpenid) return false

    if (text === "#QQ绑定") {
      await createBindSession(appid, rawOpenid)
      await this.e.reply("请输入你的 QQ 号（5 分钟内有效）")
      return true
    }

    if (!isQQUin(text)) return false
    if (!(await consumeBindSession(appid, rawOpenid))) return false

    await this.e.reply("正在校验")
    try {
      const ok = await verifyAvatar(appid, rawOpenid, text)
      if (!ok) {
        await this.e.reply("绑定失败 和 真实QQ不符合")
        return true
      }

      await saveMapping(appid, rawOpenid, text)
      await this.e.reply(`绑定成功：${text}`)
      return true
    } catch (err) {
      Bot.makeLog?.("error", ["QQBot 绑定校验失败", appid, rawOpenid, text, err], this.e.self_id)
      await this.e.reply("绑定失败 请稍后重试。")
      return true
    }
  }
}
