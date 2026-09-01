import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import sdk from "qq-official-bot"

const content = `[群聊的聊天记录]
=== 消息 1 ===
[消息内容] 文本
[发送者] 我爱你

=== 消息 2 ===
[发送者] 我爱你
[附件1] 类型:图片 文件名:image.jpg 尺寸:1078x4096 大小:253.7KB URL:https://example.com/image.jpg?a=1&b=2

=== 消息 3 ===
[发送者] 我爱你
[附件1] 类型:文件 文件名:1111.txt 大小:9.4KB

=== 消息 4 ===
[发送者] 我爱你
[附件1] 类型:视频 文件名:video.mp4 尺寸:640x1418 大小:514.3KB URL:https://example.com/video.mp4

=== 消息 5 ===
[消息内容] <faceType=6,faceId="0",ext="eyJ0ZXh0IjoiIn0=">
[发送者] 我爱你
[附件1] 类型:动图 文件名:animated.jpg 尺寸:320x320 大小:1.7MB URL:https://example.com/animated.jpg`

const parserBot = Object.create(sdk.Bot.prototype)
parserBot.removeAt = () => {}
parserBot.logger = { info () {}, warn () {}, debug () {} }
parserBot.self_id = "10000"

const event = parserBot.processPayload("event-1", "message.group", {
  id: "message-1",
  group_id: "group-openid",
  author: {
    id: "user-openid",
    username: "我爱你",
    member_role: "owner",
  },
  timestamp: "2026-08-19T00:39:08+08:00",
  message_type: 102,
  content,
  attachments: [{ content_type: "image/jpeg", url: "https://example.com/outer.jpg" }],
})

const forward = event.message[0]
assert.equal(forward.type, "forward")
assert.equal(forward.data.nodes.length, 5)
assert.equal(forward.data.nodes[0].content, "文本")
assert.deepEqual(forward.data.nodes[1].attachments[0], {
  index: 1,
  type: "image",
  raw_type: "图片",
  file_name: "image.jpg",
  width: 1078,
  height: 4096,
  size_text: "253.7KB",
  url: "https://example.com/image.jpg?a=1&b=2",
})
assert.equal(forward.data.nodes[2].attachments[0].url, undefined)
assert.equal(forward.data.nodes[3].attachments[0].type, "video")
assert.deepEqual(forward.data.nodes[4].attachments[0], {
  index: 1,
  type: "image",
  raw_type: "动图",
  file_name: "animated.jpg",
  width: 320,
  height: 320,
  size_text: "1.7MB",
  url: "https://example.com/animated.jpg",
  animated: true,
})
assert.equal(event.attachments[0].url, "https://example.com/outer.jpg")

const nestedEvent = parserBot.processPayload("event-2", "message.group", {
  id: "message-2",
  group_id: "group-openid",
  author: { id: "user-openid", username: "我爱你" },
  timestamp: "2026-08-19T00:39:08+08:00",
  message_type: 102,
  content: `[嵌套记录]
=== 消息 1 ===
[发送者] 外层
[消息类型] 合并转发消息
[关联消息]
  --- 第1条 ---
  [发送者] 内层
  [附件1] 类型:语音 文件名:voice.amr 大小:2.1KB URL:https://example.com/voice.amr`,
})
assert.equal(nestedEvent.message[0].data.nodes[0].children[0].attachments[0].type, "audio")

const malformedEvent = parserBot.processPayload("event-3", "message.group", {
  id: "message-3",
  group_id: "group-openid",
  author: { id: "user-openid", username: "我爱你" },
  timestamp: "2026-08-19T00:39:08+08:00",
  message_type: 102,
  content: `[异常附件]
=== 消息 1 ===
[发送者] 我爱你
[附件1] 文件名:unknown.bin 大小:1KB`,
})
assert.equal(malformedEvent.message[0].data.nodes[0].attachments, undefined)
assert.equal(malformedEvent.message[0].data.nodes[0].content, "[附件1] 文件名:unknown.bin 大小:1KB")

let emitted
const adapter = {
  sendGroupMsg: async () => {},
  recallGroupMsg: async () => {},
  getGroupInfo: async () => ({ group_name: "测试群" }),
  setGroupMap: async () => {},
}
const runtimeBot = {
  info: { appid: "appid", id: "10000" },
  adapter,
}
global.Bot = {
  10000: runtimeBot,
  em: (_name, data) => { emitted = data },
  makeLog: () => {},
}

const { setMessageStoreRoot } = await import("../lib/messageStore.js")
setMessageStoreRoot(await fs.mkdtemp(path.join(os.tmpdir(), "qqbot-forward-message-")))
const { makeMessage } = await import("../lib/messageBuilder.js")
await makeMessage(adapter, "10000", event)

const node = emitted.message[0]
assert.equal(node.type, "node")
assert.deepEqual(node.data[1].message[0], {
  type: "image",
  file: "https://example.com/image.jpg?a=1&b=2",
  url: "https://example.com/image.jpg?a=1&b=2",
  name: "image.jpg",
  width: 1078,
  height: 4096,
})
assert.deepEqual(node.data[2].message[0], {
  type: "text",
  text: "[文件：1111.txt，大小：9.4KB]",
})
assert.equal(node.data[3].message[0].type, "video")
assert.equal(node.data[4].message[1].type, "image")
assert.equal(node.data[4].message[1].animated, true)

console.log("forward message tests passed")
