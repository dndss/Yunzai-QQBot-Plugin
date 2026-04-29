import fs from "node:fs/promises"
import path from "node:path"
import { ulid } from "ulid"
import imageSize from "image-size"
import urlRegexSafe from "url-regex-safe"
import { encode as encodeSilk, isSilk } from "silk-wasm"
import { generateQRCode, compressImage } from "./utils.js"

export class Converter {
  constructor (adapter) {
    this.adapter = adapter
  }

  // 语音转 silk
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
    if (isSilk(buffer)) return buffer

    const convFile = path.join("temp", ulid())
    try {
      await fs.writeFile(convFile, buffer)
      await Bot.exec(`ffmpeg -i "${convFile}" -f s16le -ar 48000 -ac 1 "${convFile}.pcm"`)
      file = Buffer.from((await encodeSilk(await fs.readFile(`${convFile}.pcm`), 48000)).data)
    } catch (err) {
      Bot.makeLog("error", ["silk 转码错误", file, err])
    }

    for (const i of [convFile, `${convFile}.pcm`]) fs.unlink(i).catch(() => {})
    return file
  }

  // 生成二维码图片数据
  async makeQRCode (data) {
    return generateQRCode(data)
  }

  // 处理 Markdown 文本中的链接
  async makeRawMarkdownText (data, text, button) {
    const match = text.match(this.adapter.toQRCodeRegExp)
    if (match)
      for (const url of match) {
        if (button) button.push(...this.makeButtons(data, [[{ text: url, link: url }]]))
        const img = await this.makeMarkdownImage(data, await this.makeQRCode(url), "二维码")
        text = text.replace(url, `${img.des}${img.url}`)
      }
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
          msg => Bot.makeLog(msg[0], [msg[1]], data.self_id))
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

  // 构建一个按钮消息段
  makeButton (data, button, style) {
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
      if (this.adapter.config.toCallback) {
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
      } else {
        msg.action = {
          type: 2,
          permission: { type: 2 },
          data: button.callback,
          enter: true,
          ...button.QQBot?.action,
        }
      }
    } else if (button.link)
      msg.action = {
        type: 0,
        permission: { type: 2 },
        data: button.link,
        ...button.QQBot?.action,
      }
    else return false

    if (button.permission) {
      if (button.permission === "admin") {
        msg.action.permission.type = 1
      } else {
        msg.action.permission.type = 0
        msg.action.permission.specify_user_ids = []
        if (!Array.isArray(button.permission)) button.permission = [button.permission]
        for (const id of button.permission)
          msg.action.permission.specify_user_ids.push(id.replace(`${data.self_id}${this.adapter.sep}`, ""))
      }
    }
    return msg
  }

  // 将二维按钮数组转换为 button 消息段数组
  makeButtons (data, button_square) {
    const msgs = [],
      random = Math.floor(Math.random() * 2)
    for (const button_row of button_square) {
      let column = 0
      const buttons = []
      for (let button of button_row) {
        button = this.makeButton(data, button, (random + msgs.length + buttons.length) % 2)
        if (button) buttons.push(button)
      }
      if (buttons.length) msgs.push({ type: "button", buttons })
    }
    return msgs
  }

  // 文本链（用于 Markdown 内嵌）
  makeTextChain (data, button) {
    let msg
    if (button.input) msg = `text="${button.input}"`
    else if (button.callback) msg = `text="${button.callback}"`
    else if (button.link) msg = `text="${button.link}"`
    else return false

    if (button.text) msg += ` show="[${button.text}]"`
    return `<qqbot-cmd-input ${msg} />`
  }

  makeTextChains (data, button_square) {
    const msgs = []
    for (const button_row of button_square) {
      const buttons = []
      for (let button of button_row) {
        button = this.makeTextChain(data, button)
        if (button) buttons.push(button)
      }
      if (buttons.length) msgs.push(buttons.join(" "))
    }
    if (msgs.length) msgs.unshift("")
    return msgs.join("\n")
  }

  // Raw Markdown 消息组装
  async makeRawMarkdownMsg (data, msg, keyboard, nested) {
    const messages = [],
      button = []
    let content = "",
      reply

    for (let i of Array.isArray(msg) ? msg : [msg]) {
      if (typeof i === "object") i = { ...i }
      else i = { type: "text", text: Bot.String(i) }

      switch (i.type) {
        case "record":
          i.type = "audio"
          i.file = await this.makeRecord(i.file)
        case "video":
        case "face":
        case "ark":
        case "embed":
          messages.push([i])
          break
        case "file":
          if (i.file) i.file = await Bot.fileToUrl(i.file, i)
          content += await this.makeRawMarkdownText(data, `文件：${i.file}`, keyboard && button)
          break
        case "at":
          if (i.qq === "all") content += "<qqbot-at-everyone />"
          else
            content += `<qqbot-at-user id="${i.qq?.replace?.(`${data.self_id}${this.adapter.sep}`, "")}" />`
          break
        case "text":
          content += await this.makeRawMarkdownText(data, i.text, keyboard && button)
          break
        case "image": {
          const { des, url } = await this.makeMarkdownImage(data, i.file, i.summary)
          content += `${des}${url}`
          break
        }
        case "markdown":
          if (typeof i.data === "object") messages.push([{ type: "markdown", ...i.data }])
          else content += i.data
          break
        case "button":
          if (keyboard) button.push(...this.makeButtons(data, i.data))
          else content += this.makeTextChains(data, i.data)
          break
        case "reply":
          reply = i
          continue
        case "node":
          for (const { message } of i.data)
            messages.push(...(await this.makeRawMarkdownMsg(data, message, keyboard, true)))
          continue
        case "raw":
          messages.push(Array.isArray(i.data) ? i.data : [i.data])
          break
        default:
          content += await this.makeRawMarkdownText(data, Bot.String(i), keyboard && button)
      }
    }

    if (content) messages.unshift([{ type: "markdown", content }])

    if (button.length) {
      for (const i of messages) {
        if (i[0].type === "markdown") i.push(...button.splice(0, 5))
        if (!button.length) break
      }
      while (button.length)
        messages.push([{ type: "markdown", content: " " }, ...button.splice(0, 5)])
    }

    if (!reply && !nested && data.message_id) reply = segment.reply(data.message_id)
    if (reply) {
      if (reply.id.startsWith("event_"))
        reply = { type: "reply", event_id: reply.id.replace(/^event_/, "") }
      for (const i in messages) {
        if (Array.isArray(messages[i])) messages[i].unshift(reply)
        else messages[i] = [reply, messages[i]]
      }
    }
    return messages
  }

  // 以下为 Markdown 模板相关
  makeMarkdownText_ (data, text) {
    const match = text.match(this.adapter.toQRCodeRegExp)
    if (match)
      for (const url of match)
        text = text.replace(url, this.makeTextChain(data, { text: "链接", link: url }))
    return text
      .replace(/\n/g, "\r")
      .replace(/@/g, "@​")
      .replace(/<qqbot-/g, "<qqbot-​")
  }

  makeMarkdownText (data, text, content) {
    const match = text.match(/!?\[.*?\]\s*\(\w+:\/\/.*?\)/g)
    if (match) {
      const temp = []
      let last = ""
      for (const i of match) {
        const match = i.match(/(!?\[.*?\])\s*(\(\w+:\/\/.*?\))/)
        text = text.split(i)
        temp.push([last + this.makeMarkdownText_(data, text.shift()), match[1]])
        text = text.join(i)
        last = match[2]
      }
      temp[0][0] = content + temp[0][0]
      return [last + this.makeMarkdownText_(data, text), temp]
    }
    return [this.makeMarkdownText_(data, text)]
  }

  makeMarkdownTemplate (data, templates) {
    const msgs = []
    for (const template of templates) {
      if (!template.length) continue

      const params = []
      for (const i in template)
        params.push({
          key: this.adapter.config.markdown.template[i],
          values: [template[i]],
        })

      msgs.push([
        {
          type: "markdown",
          custom_template_id: this.adapter.config.markdown[data.self_id],
          params,
        },
      ])
    }
    return msgs
  }

  makeMarkdownTemplatePush (content, template, templates) {
    for (const i of content) {
      if (template.length === this.adapter.config.markdown.template.length - 1) {
        template.push(i.shift())
        template = i
        templates.push(template)
      } else {
        template.push(i.join(""))
      }
    }
    return template
  }

  async makeMarkdownMsg (data, msg, nested) {
    const messages = [],
      templates = [[]]
    let content = "",
      reply,
      template = templates[0]

    for (let i of Array.isArray(msg) ? msg : [msg]) {
      if (typeof i === "object") i = { ...i }
      else i = { type: "text", text: Bot.String(i) }

      switch (i.type) {
        case "record":
          i.type = "audio"
          i.file = await this.makeRecord(i.file)
        case "video":
        case "face":
        case "ark":
        case "embed":
          messages.push([i])
          break
        case "file":
          if (i.file) i.file = await Bot.fileToUrl(i.file, i)
          content += this.makeTextChain(data, { text: `文件：${i.name || i.file}`, link: i.file })
          break
        case "at":
          if (i.qq === "all") content += "<qqbot-at-everyone />"
          else
            content += `<qqbot-at-user id="${i.qq?.replace?.(`${data.self_id}${this.adapter.sep}`, "")}" />`
          break
        case "text": {
          const [text, temp] = this.makeMarkdownText(data, i.text, content)
          if (Array.isArray(temp)) {
            template = this.makeMarkdownTemplatePush(temp, template, templates)
            content = text
          } else {
            content += text
          }
          break
        }
        case "image": {
          const { des, url } = await this.makeMarkdownImage(data, i.file, i.summary)
          template = this.makeMarkdownTemplatePush([[content, des]], template, templates)
          content = url
          break
        }
        case "markdown":
          if (typeof i.data === "object") messages.push([{ type: "markdown", ...i.data }])
          else content += i.data
          break
        case "button":
          content += this.makeTextChains(data, i.data)
          break
        case "reply":
          reply = i
          continue
        case "node":
          for (const { message } of i.data)
            messages.push(...(await this.makeMarkdownMsg(data, message, true)))
          continue
        case "raw":
          messages.push(Array.isArray(i.data) ? i.data : [i.data])
          break
        default: {
          const [text, temp] = this.makeMarkdownText(data, Bot.String(i), content)
          if (Array.isArray(temp)) {
            template = this.makeMarkdownTemplatePush(temp, template, templates)
            content = text
          } else {
            content += text
          }
        }
      }
    }

    if (content) template.push(content)
    messages.push(...this.makeMarkdownTemplate(data, templates))

    if (!reply && !nested && data.message_id) reply = segment.reply(data.message_id)
    if (reply)
      for (const i of messages)
        i.unshift(
          reply.id.startsWith("event_")
            ? { type: "reply", event_id: reply.id.replace(/^event_/, "") }
            : reply,
        )
    return messages
  }

  // 普通消息（非 Markdown 富文本）
  async makeMsg (data, msg, nested) {
    const messages = [],
      button = []
    let message = [],
      reply

    for (let i of Array.isArray(msg) ? msg : [msg]) {
      if (typeof i === "object") i = { ...i }
      else i = { type: "text", text: Bot.String(i) }

      switch (i.type) {
        case "at":
          //i.user_id = i.qq?.replace?.(`${data.self_id}${this.adapter.sep}`, "")
          continue
        case "text":
          if (!i.text || !i.text.trim()) continue
          break
        case "face":
        case "ark":
        case "embed":
          break
        case "record":
          i.type = "audio"
          i.file = await this.makeRecord(i.file)
        case "video":
        case "image":
          if (message.length) {
            messages.push(message)
            message = []
          }

          if (this.adapter.config.imageLength && i.file) {
            const buf = await Bot.Buffer(i.file, { http: true })
            if (Buffer.isBuffer(buf))
              i.file = await compressImage(buf, this.adapter.config.imageLength * 1024 * 1024,
                msg => Bot.makeLog(msg[0], [msg[1]], data.self_id))
          }
          break
        case "file":
          if (i.file) i.file = await Bot.fileToUrl(i.file, i)
          i = { type: "text", text: `文件：${i.file}` }
          break
        case "reply":
          reply = i
          continue
        case "markdown":
          if (typeof i.data === "object") i = { type: "markdown", ...i.data }
          else i = { type: "markdown", content: i.data }
          break
        case "button":
          //button.push(...this.makeButtons(data, i.data))
          continue
        case "node":
          for (const { message } of i.data)
            messages.push(...(await this.makeMsg(data, message, true)))
          continue
        case "raw":
          if (Array.isArray(i.data)) {
            messages.push(i.data)
            continue
          }
          i = i.data
          break
        default:
          i = { type: "text", text: Bot.String(i) }
      }

      if (i.type === "text" && i.text) {
        const match = i.text.match(this.adapter.toQRCodeRegExp)
        if (match)
          for (const url of match) {
            const msg = segment.image(await this.makeQRCode(url))
            if (message.length) {
              messages.push(message)
              message = []
            }
            message.push(msg)
            i.text = i.text.replace(url, "[链接(请扫码查看)]")
          }
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

    if (!reply && !nested && data.message_id) reply = segment.reply(data.message_id)
    if (reply)
      for (const i of messages)
        i.unshift(
          reply.id.startsWith("event_")
            ? { type: "reply", event_id: reply.id.replace(/^event_/, "") }
            : reply,
        )
    return messages
  }

  // 频道消息转换
  async makeGuildMsg (data, msg, nested) {
    const messages = []
    let message = [],
      reply
    for (let i of Array.isArray(msg) ? msg : [msg]) {
      if (typeof i === "object") i = { ...i }
      else i = { type: "text", text: Bot.String(i) }

      switch (i.type) {
        case "at":
          i.user_id = i.qq?.replace?.(/^qg_/, "")
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
          if (i.file) i.file = await Bot.fileToUrl(i.file, i)
          i = { type: "text", text: `文件：${i.file}` }
          break
        case "reply":
          reply = i
          continue
        case "markdown":
          if (typeof i.data === "object") i = { type: "markdown", ...i.data }
          else i = { type: "markdown", content: i.data }
          break
        case "button":
          continue
        case "node":
          for (const { message } of i.data)
            messages.push(...(await this.makeGuildMsg(data, message, true)))
          continue
        case "raw":
          if (Array.isArray(i.data)) {
            messages.push(i.data)
            continue
          }
          i = i.data
          break
        default:
          i = { type: "text", text: Bot.String(i) }
      }

      if (i.type === "text" && i.text) {
        const match = i.text.match(this.adapter.toQRCodeRegExp)
        if (match)
          for (const url of match) {
            const msg = segment.image(await this.makeQRCode(url))
            message.push(msg)
            messages.push(message)
            message = []
            i.text = i.text.replace(url, "[链接(请扫码查看)]")
          }
      }

      message.push(i)
    }

    if (message.length) messages.push(message)
    if (!reply && !nested && data.message_id) reply = segment.reply(data.message_id)
    if (reply)
      for (const i of messages)
        i.unshift(
          reply.id.startsWith("event_")
            ? { type: "reply", event_id: reply.id.replace(/^event_/, "") }
            : reply,
        )
    return messages
  }
}
