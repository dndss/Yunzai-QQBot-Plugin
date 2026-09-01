import assert from "node:assert/strict"

global.Bot = {
  String: value => String(value),
  makeLog () {},
}

global.redis = {
  get: async key => key === "map:uin:appid:123456789"
    ? JSON.stringify({ appid: "appid", openid: "user-openid" })
    : null,
}

const { installMessageSender } = await import("../lib/messageSender.js")
const { makeStreamReplyPayload } = await import("../lib/streamMessage.js")

const adapter = {
  sep: ":",
  config: {},
  converter: {},
}
installMessageSender(adapter)

const calls = []
const response = {
  id: "stream-id",
  timestamp: "2026-07-21T10:00:00+08:00",
}
const data = {
  self_id: "bot-id",
  user_id: "123456789",
  bot: {
    info: { appid: "appid" },
    sdk: {
      sendPrivateStreamMessage: async (...args) => {
        calls.push(args)
        return response
      },
    },
  },
}
const payload = {
  input_state: 1,
  index: 0,
  content_type: "text",
  content_raw: "处理中",
  msg_id: "message-id",
}

assert.equal(
  await adapter.sendFriendStreamMsg(data, payload, { timeout: 30000 }),
  response,
)
assert.deepEqual(calls[0], ["user-openid", payload, { timeout: 30000 }])

const replyPayload = { input_state: 1, index: 0, content_raw: "回复" }
assert.deepEqual(
  makeStreamReplyPayload(replyPayload, { message_id: "incoming-message-id" }),
  { ...replyPayload, msg_id: "incoming-message-id" },
)
assert.deepEqual(
  makeStreamReplyPayload(replyPayload, {
    message_id: "event_callback-id",
    event_id: "callback-id",
  }),
  { ...replyPayload, event_id: "callback-id" },
)
assert.deepEqual(
  makeStreamReplyPayload({ ...replyPayload, event_id: "explicit-event" }, {
    message_id: "incoming-message-id",
  }),
  { ...replyPayload, event_id: "explicit-event" },
)
assert.equal("msg_id" in replyPayload, false)

console.log("plugin stream message tests passed")
