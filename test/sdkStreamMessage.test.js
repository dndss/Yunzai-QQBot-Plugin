import assert from "node:assert/strict"

// 先从包入口初始化 SDK，避免直接加载事件子模块触发其既有循环依赖。
const { PrivateMessageEvent } = await import("qq-official-bot")
const { MessageService } = await import("../lib/modules/qq-official-bot/lib/services/message.js")

const calls = []
const response = {
  id: "stream-message-id",
  timestamp: "2026-07-21T10:00:00+08:00",
  ext_info: { ref_idx: "reference-index" },
  remain_msg_len: 128,
}
const request = {
  post: async (url, payload, config) => {
    calls.push({ url, payload: structuredClone(payload), config: structuredClone(config) })
    return { data: response, status: 200 }
  },
}
const service = new MessageService(request, "appid")
const payload = {
  input_mode: "append",
  input_state: 1,
  index: 0,
  content_type: "markdown",
  content_raw: "正在生成",
  msg_id: "message-id",
  msg_seq: 1,
}

const result = await service.sendPrivateStreamMessage("user-openid", payload, { timeout: 30000 })
assert.equal(calls[0].url, "/v2/users/user-openid/stream_messages")
assert.deepEqual(calls[0].payload, payload)
assert.deepEqual(calls[0].config, {
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
})
assert.deepEqual(result, response)

const eventCalls = []
const bot = {
  sendPrivateStreamMessage: async (...args) => {
    eventCalls.push(args)
    return response
  },
}
const event = new PrivateMessageEvent(bot, "friend", {
  message_id: "incoming-message-id",
  user_id: "user-openid",
})
const eventPayload = {
  input_state: 1,
  index: 0,
  content_type: "text",
  content_raw: "处理中",
}
await event.streamReply(eventPayload, { timeout: 20000 })
assert.deepEqual(eventCalls[0], [
  "user-openid",
  { ...eventPayload, msg_id: "incoming-message-id" },
  { timeout: 20000 },
])
assert.equal("msg_id" in eventPayload, false)

const directEvent = new PrivateMessageEvent(bot, "direct", {
  message_id: "direct-message-id",
  user_id: "user-openid",
})
await assert.rejects(
  directEvent.streamReply(eventPayload),
  /频道私信不支持 C2C 流式消息接口/,
)

console.log("sdk stream message tests passed")
