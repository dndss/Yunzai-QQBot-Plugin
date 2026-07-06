import { ulid } from "ulid"
import * as imageSizeModule from "image-size"
import { compressImage } from "./utils.js"
import { translateToOpenid } from "./uinMap.js"

const imageSize = imageSizeModule.imageSize || imageSizeModule.default || imageSizeModule

export class Converter {
  constructor (adapter) {
    this.adapter = adapter
  }

  // 语音发送（原生格式，不转 silk）
  async makeRecord (file) {
    if (this.adapter.config.toBotUpload)
      for (const i of Bot.uin) {
        if (!Bot[i].uploadRecord) continue
        try {
          const url = await Bot[i].uploadRecord(file)
          if (url) return url
        } catch (err) {
          Bot.makeLog("error", ["Bot", i, "语音上传错误", file, err])
        }
      }

    const buffer = await Bot.Buffer(file)
    if (!Buffer.isBuffer(buffer)) return file

    // silk/wav/mp3/flac 等格式原生发送，不再强制转码为 silk
    return buffer
  }

  // 转义 Markdown 文本中的特殊字符
  makeRawMarkdownText (text) {
    return text.replace(/@/g, "@​").replace(/<qqbot-/g, "<qqbot-​")
  }

  // 上传图片
  async makeBotImage (file) {
    if (this.adapter.config.toBotUpload)
      for (const i of Bot.uin) {
        if (!Bot[i].uploadImage) continue
        try {
          const image = await Bot[i].uploadImage(file)
          if (image.url) return image
        } catch (err) {
          Bot.makeLog("error", ["Bot", i, "图片上传错误", file, err])
        }
      }
  }

  // 处理 Markdown 图片
  async makeMarkdownImage (data, file, summary = "图片") {
    if (this.adapter.config.imageLength) {
      const buf = await Bot.Buffer(file, { http: true })
      if (Buffer.isBuffer(buf))
        file = await compressImage(buf, this.adapter.config.imageLength * 1024 * 1024,
          (level, message) => Bot.makeLog(level, [message], data.self_id))
    }
    const buffer = await Bot.Buffer(file)
    const image = (await this.makeBotImage(buffer)) || { url: await Bot.fileToUrl(file) }

    if (!image.width || !image.height)
      try {
        const size = imageSize(buffer)
        image.width = size.width
        image.height = size.height
      } catch (err) {
        Bot.makeLog("error", ["图片分辨率检测错误", file, err], data.self_id)
      }

    return {
      des: `![${summary} #${image.width || 0}px #${image.height || 0}px]`,
      url: `(${image.url})`,
    }
  }

  makeReply (reply, data) {
    if (!reply) return reply
    if (reply.data?.id?.startsWith?.("event_")) {
      if (data?.raw?.event_id) return { type: "reply", data: { event_id: data.raw.event_id } }
      return false
    }
    if (reply.data?.id?.startsWith?.("INTERACTION_CREATE:")) {
      const event_id = reply.data.id.replace(/^INTERACTION_CREATE:/, "")
      if (data?.raw?.event_id === event_id) return { type: "reply", data: { event_id } }
      return false
    }
    return reply
  }

  // 构建一个按钮消息段
  async makeButton (data, button, style) {
    const msg = {
      id: ulid(),
      render_data: {
        label: button.text,
        visited_label: button.clicked_text,
        style,
        ...button.QQBot?.render_data,
      },
    }

    if (button.input)
      msg.action = {
        type: 2,
        permission: { type: 2 },
        data: button.input,
        enter: button.send,
        ...button.QQBot?.action,
      }
    else if (button.callback) {
      msg.action = {
        type: 1,
        permission: { type: 2 },
        ...button.QQBot?.action,
      }
      if (!Array.isArray(data._ret_id)) data._ret_id = []
      data.bot.callback[msg.id] = {
        id: data.message_id,
        user_id: data.user_id,
        group_id: data.group_id,
        message: button.callback,
        message_id: data._ret_id,
      }
      setTimeout(() => delete data.bot.callback[msg.id], 300000)
    } else if (button.link)
      msg.action = {
        type: 0,
        permission: { type: 2 },
        data: button.link,
        ...button.QQBot?.action,
      }
    else return false

    // 私聊场景忽略 permission 字段：私聊只有一个对话者，permission 无实际意义，
    // 且传入后会导致手机端显示"无权限"，PC端正常，属于QQ官方API的客户端差异化bug。
    if (button.permission && data.group_id) {
      if (button.permission === "admin") {
        msg.action.permission.type = 1
      } else {
        msg.action.permission.type = 0
        msg.action.permission.specify_user_ids = []
        if (!Array.isArray(button.permission)) button.permission = [button.permission]
        for (const id of button.permission) {
          const stripped = id.replace(`${data.self_id}${this.adapter.sep}`, "")
          const openid = await translateToOpenid(data.bot || data.self_id, stripped)
          msg.action.permission.specify_user_ids.push(openid)
        }
      }
    }
    return msg
  }

  // 将按钮数组转换为 button 消息段数组
  async makeButtons (data, button_square) {
    // 兼容多种写法：
    // segment.button({ ... })                  单个按钮
    // segment.button([{ ... }, { ... }])       一行多个按钮
    // segment.button([{ ... }], [{ ... }])     多行按钮
    // segment.button([[{ ... }], [{ ... }]])   旧文档中的二维数组写法
    if (!Array.isArray(button_square)) button_square = [[button_square]]
    else if (button_square.length === 1 && Array.isArray(button_square[0]) && Array.isArray(button_square[0][0])) button_square = button_square[0]
    else if (button_square.length && !Array.isArray(button_square[0])) button_square = [button_square]

    const msgs = [],
      random = Math.floor(Math.random() * 2)
    for (let button_row of button_square) {
      if (!Array.isArray(button_row)) button_row = [button_row]
      const buttons = []
      for (let button of button_row) {
        button = await this.makeButton(data, button, (random + msgs.length + buttons.length) % 2)
        if (button) buttons.push(button)
      }
      if (buttons.length) msgs.push({ type: "button", data: { buttons } })
    }
    return msgs
  }

  hasNativeImageMixedContent (msg) {
    if (this.adapter.config.markdownImage === true) return false
    const state = { image: false, content: false }
    const scan = value => {
      if (Array.isArray(value)) {
        for (const item of value) scan(item)
        return
      }
      if (value == null) return
      if (typeof value !== "object") {
        if (Bot.String(value).trim()) state.content = true
        return
      }

      switch (value.type) {
        case "image":
          state.image = true
          break
        case "text":
          if (String(value.text ?? value.data?.text ?? "").trim()) state.content = true
          break
        case "markdown":
        case "at":
        case "file":
          state.content = true
          break
        case "node":
          for (const item of value.data?.data || []) scan(item.message)
          break
      }
    }

    scan(msg)
    return state.image && state.content
  }

  normalizeSendableSegment (i) {
    if (typeof i === "object") return { type: i.type, data: { ...i, type: undefined } }
    return { type: "text", data: { text: Bot.String(i) } }
  }

  markdownDataToText (data) {
    const markdown = data?.data
    if (typeof markdown === "string") return markdown
    if (markdown?.content) return markdown.content
    return Bot.String(markdown || "")
  }

  async makeNativeRichMsg (data, msg, nested) {
    const messages = [],
      button = []
    let message = [],
      reply,
      hasMedia = false

    const pushMessage = () => {
      if (!message.length) return
      messages.push(message)
      message = []
      hasMedia = false
    }

    for (let i of Array.isArray(msg) ? msg : [msg]) {
      i = this.normalizeSendableSegment(i)

      switch (i.type) {
        case "record":
          i.type = "audio"
          i.data.file = await this.makeRecord(i.data.file)
        case "video":
        case "image":
          if (hasMedia) pushMessage()
          if (this.adapter.config.imageLength && i.data.file) {
            const buf = await Bot.Buffer(i.data.file, { http: true })
            if (Buffer.isBuffer(buf))
              i.data.file = await compressImage(buf, this.adapter.config.imageLength * 1024 * 1024,
                (level, message) => Bot.makeLog(level, [message], data.self_id))
          }
          message.push(i)
          hasMedia = true
          break
        case "at": {
          if (data.message_type === "private") continue
          const qq = String(i.data.qq ?? i.data.user_id ?? "").replace(`${data.self_id}${this.adapter.sep}`, "")
          const user_id = qq === "all" ? "all" : await translateToOpenid(data.bot || data.self_id, qq)
          message.push({ type: "at", data: { user_id } })
          break
        }
        case "text":
          if (i.data.text) message.push({ type: "text", data: { text: i.data.text } })
          break
        case "markdown": {
          const text = this.markdownDataToText(i.data)
          if (text) message.push({ type: "text", data: { text } })
          break
        }
        case "file":
          if (hasMedia) pushMessage()
          message.push(i)
          hasMedia = true
          break
        case "button":
          button.push(...await this.makeButtons(data, i.data.data))
          break
        case "reply":
          reply = i
          continue
        case "node":
          pushMessage()
          for (const { message } of i.data.data)
            messages.push(...(await this.makeNativeRichMsg(data, message, true)))
          continue
        case "raw":
          pushMessage()
          messages.push(Array.isArray(i.data.data) ? i.data.data : [i.data.data])
          break
        default:
          message.push(i)
      }
    }

    pushMessage()

    if (button.length) {
      for (const i of messages) {
        i.push(...button.splice(0, 5))
        if (!button.length) break
      }
      while (button.length)
        messages.push([{ type: "text", data: { text: " " } }, ...button.splice(0, 5)])
    }

    if (!reply && !nested && data.message_id) reply = { type: "reply", data: { id: data.message_id } }
    reply = this.makeReply(reply, data)
    if (reply) {
      for (const i of messages)
        i.unshift(reply)
    }
    return messages
  }
  // Raw Markdown 消息组装
  async makeRawMarkdownMsg (data, msg, nested) {
    if (this.hasNativeImageMixedContent(msg))
      return this.makeNativeRichMsg(data, msg, nested)
    const messages = [],
      button = []
    let content = "",
      reply

    for (let i of Array.isArray(msg) ? msg : [msg]) {
      if (typeof i === "object") i = { type: i.type, data: { ...i, type: undefined } }
      else i = { type: "text", data: { text: Bot.String(i) } }

      switch (i.type) {
        case "record":
          i.type = "audio"
          i.data.file = await this.makeRecord(i.data.file)
        case "video":
        case "face":
        case "ark":
        case "embed":
          messages.push([i])
          break
        case "file":
          messages.push([i])
          break
        case "at": {
          if (data.message_type === "private") continue
          if (i.data.qq === "all") content += "<qqbot-at-everyone />"
          else {
            const qq = String(i.data.qq ?? "").replace(`${data.self_id}${this.adapter.sep}`, "")
            const openid = await translateToOpenid(data.bot || data.self_id, qq)
            content += `<qqbot-at-user id="${openid}" />`
          }
          break
        }
        case "text":
          content += this.makeRawMarkdownText(i.data.text)
          break
        case "image": {
          if (this.adapter.config.markdownImage === true) {
            const { des, url } = await this.makeMarkdownImage(data, i.data.file, i.data.summary)
            content += `${des}${url}`
          } else if (this.adapter.config.imageLength && i.data.file) {
            const buf = await Bot.Buffer(i.data.file, { http: true })
            if (Buffer.isBuffer(buf))
              i.data.file = await compressImage(buf, this.adapter.config.imageLength * 1024 * 1024,
                (level, message) => Bot.makeLog(level, [message], data.self_id))
            messages.push([i])
          } else {
            messages.push([i])
          }
          break
        }
        case "markdown":
          if (typeof i.data.data === "object") messages.push([{ type: "markdown", data: i.data.data }])
          else content += i.data.data
          break
        case "button":
          button.push(...await this.makeButtons(data, i.data.data))
          break
        case "reply":
          reply = i
          continue
        case "node":
          for (const { message } of i.data.data)
            messages.push(...(await this.makeRawMarkdownMsg(data, message, true)))
          continue
        case "raw":
          messages.push(Array.isArray(i.data.data) ? i.data.data : [i.data.data])
          break
        default:
          content += this.makeRawMarkdownText(Bot.String(i))
      }
    }

    if (content) messages.unshift([{ type: "markdown", data: { content } }])

    if (button.length) {
      for (const i of messages) {
        if (i[0].type === "markdown") i.push(...button.splice(0, 5))
        if (!button.length) break
      }
      while (button.length)
        messages.push([{ type: "markdown", data: { content: " " } }, ...button.splice(0, 5)])
    }

    if (!reply && !nested && data.message_id) reply = { type: "reply", data: { id: data.message_id } }
    reply = this.makeReply(reply, data)
    if (reply) {
      for (const i in messages) {
        if (Array.isArray(messages[i])) messages[i].unshift(reply)
        else messages[i] = [reply, messages[i]]
      }
    }
    return messages
  }


  async makeMsg (data, msg, nested) {
    const messages = [],
      button = []
    let message = [],
      reply

    for (let i of Array.isArray(msg) ? msg : [msg]) {
      if (typeof i === "object") i = { type: i.type, data: { ...i, type: undefined } }
      else i = { type: "text", data: { text: Bot.String(i) } }

      switch (i.type) {
        case "at":
          //i.data.user_id = i.data.qq?.replace?.(`${data.self_id}${this.adapter.sep}`, "")
          continue
        case "text":
          if (!i.data.text || !i.data.text.trim()) continue
          break
        case "face":
        case "ark":
        case "embed":
          break
        case "record":
          i.type = "audio"
          i.data.file = await this.makeRecord(i.data.file)
        case "video":
        case "image":
          if (message.length) {
            messages.push(message)
            message = []
          }

          if (this.adapter.config.imageLength && i.data.file) {
            const buf = await Bot.Buffer(i.data.file, { http: true })
            if (Buffer.isBuffer(buf))
              i.data.file = await compressImage(buf, this.adapter.config.imageLength * 1024 * 1024,
                (level, message) => Bot.makeLog(level, [message], data.self_id))
          }
          break
        case "file":
          if (message.length) {
            messages.push(message)
            message = []
          }
          break
        case "reply":
          reply = i
          continue
        case "markdown":
          if (typeof i.data.data === "object") i = { type: "markdown", data: i.data.data }
          else i = { type: "markdown", data: { content: i.data.data } }
          break
        case "button":
          //button.push(...this.makeButtons(data, i.data.data))
          continue
        case "node":
          for (const { message } of i.data.data)
            messages.push(...(await this.makeMsg(data, message, true)))
          continue
        case "raw":
          if (Array.isArray(i.data.data)) {
            messages.push(i.data.data)
            continue
          }
          i = i.data.data
          break
        default:
          i = { type: "text", data: { text: Bot.String(i) } }
      }

      message.push(i)
    }

    if (message.length) messages.push(message)

    while (button.length)
      messages.push([
        {
          type: "keyboard",
          content: { rows: button.splice(0, 5) },
        },
      ])

    if (!reply && !nested && data.message_id) reply = { type: "reply", data: { id: data.message_id } }
    reply = this.makeReply(reply, data)
    if (reply)
      for (const i of messages)
        i.unshift(reply)
    return messages
  }

  // 频道消息转换
  async makeGuildMsg (data, msg, nested) {
    const messages = []
    let message = [],
      reply
    for (let i of Array.isArray(msg) ? msg : [msg]) {
      if (typeof i === "object") i = { type: i.type, data: { ...i, type: undefined } }
      else i = { type: "text", data: { text: Bot.String(i) } }

      switch (i.type) {
        case "at": {
          const qq = String(i.data.qq ?? "").replace(/^qg_/, "")
          i.data.user_id = await translateToOpenid(data.bot || data.self_id, qq)
          break
        }
        case "text":
        case "face":
        case "ark":
        case "embed":
          break
        case "image":
          message.push(i)
          messages.push(message)
          message = []
          continue
        case "record":
        case "video":
        case "file":
          if (i.data.file) i.data.file = await Bot.fileToUrl(i.data.file, i)
          i = { type: "text", data: { text: `文件：${i.data.file}` } }
          break
        case "reply":
          reply = i
          continue
        case "markdown":
          if (typeof i.data.data === "object") i = { type: "markdown", data: i.data.data }
          else i = { type: "markdown", data: { content: i.data.data } }
          break
        case "button":
          continue
        case "node":
          for (const { message } of i.data.data)
            messages.push(...(await this.makeGuildMsg(data, message, true)))
          continue
        case "raw":
          if (Array.isArray(i.data.data)) {
            messages.push(i.data.data)
            continue
          }
          i = i.data.data
          break
        default:
          i = { type: "text", data: { text: Bot.String(i) } }
      }

      message.push(i)
    }

    if (message.length) messages.push(message)
    if (!reply && !nested && data.message_id) reply = { type: "reply", data: { id: data.message_id } }
    reply = this.makeReply(reply, data)
    if (reply)
      for (const i of messages)
        i.unshift(reply)
    return messages
  }
}
