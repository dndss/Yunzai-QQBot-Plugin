import assert from "node:assert/strict"

const redisStore = new Map()
global.redis = {
  get: async key => redisStore.get(key) || null,
  set: async (key, value) => redisStore.set(key, value),
  del: async keys => {
    for (const key of Array.isArray(keys) ? keys : [keys]) redisStore.delete(key)
  },
}

const calls = []
const adapter = {
  sendGroupMsg: async (data, message) => calls.push(["reply", data, message]),
  recallGroupMsg: async (data, messageId) => calls.push(["recall", data, messageId]),
  sendFriendMsg: async (data, message) => calls.push(["friend-reply", data, message]),
  recallFriendMsg: async (data, messageId) => calls.push(["friend-recall", data, messageId]),
}
const bot = {
  uin: "10000",
  nickname: "QQBot",
  info: { id: "10000", appid: "appid" },
  adapter,
  pickGroup: groupId => ({
    group_id: groupId,
    pickMember: userId => ({ group_id: groupId, user_id: userId }),
  }),
  pickFriend: userId => ({ user_id: userId }),
}
global.Bot = { 10000: bot }

const {
  MESSAGE_RECORD_VERSION,
  adaptMessageRecord,
  sanitizeRawMessage,
} = await import("../lib/messageRecord.js")
const { getRecordByMsgId, getRecordByMsgIdx, saveMsgRecord } = await import("../lib/msgIdxCache.js")

const raw = {
  posttype: "message",
  messagetype: "group",
  subtype: "normal",
  messageid: "message-1",
  userid: "USER_OPENID",
  groupid: "GROUP_OPENID",
  timestamp: 123,
  author: { username: "测试用户", memberrole: "admin", id: "USER_OPENID" },
  sender: { userid: "USER_OPENID", permissions: ["normal"] },
  message: [{ type: "text", data: { text: "hello" } }],
  rawmessage: "hello",
  messagescene: { ext: ["msgidx=idx-1", "authtoken=secret", "auth_token=secret-2"] },
}
const sanitized = sanitizeRawMessage(raw)
assert.deepEqual(sanitized.messagescene.ext, ["msgidx=idx-1"])

const incoming = await adaptMessageRecord(adapter, bot, {
  version: MESSAGE_RECORD_VERSION,
  direction: "incoming",
  scene: "group",
  self_id: "10000",
  msg_idx: "idx-1",
  message_id: "message-1",
  raw: sanitized,
})
assert.equal(incoming.user_id, "USER_OPENID")
assert.equal(incoming.group_id, "GROUP_OPENID")
assert.equal(incoming.sender.nickname, "测试用户")
assert.equal(incoming.sender.role, "admin")
assert.deepEqual(incoming.message, [{ type: "text", text: "hello" }])
assert.equal(incoming.group.group_id, "GROUP_OPENID")
assert.equal(incoming.member.user_id, "USER_OPENID")
assert.equal(incoming.raw.messageid, "message-1")
assert.equal(Object.keys(incoming).includes("raw"), false)
assert.equal(Object.keys(incoming).includes("bot"), false)
assert.equal(Object.keys(incoming).includes("group"), false)
assert.equal(Object.keys(incoming).includes("member"), false)
assert.equal(JSON.stringify(incoming).includes("secret"), false)
await incoming.reply("reply")
await incoming.recall()
assert.equal(calls[0][0], "reply")
assert.equal(calls[0][1].bot, bot)
assert.equal(calls[1][0], "recall")
assert.equal(calls[1][1].bot, bot)

const privateIncoming = await adaptMessageRecord(adapter, bot, {
  version: MESSAGE_RECORD_VERSION,
  direction: "incoming",
  scene: "private",
  self_id: "10000",
  msg_idx: "private-idx",
  message_id: "private-message",
  raw: {
    messagetype: "private",
    subtype: "friend",
    messageid: "private-message",
    userid: "FRIEND_OPENID",
    message: [{ type: "text", data: { text: "private" } }],
    rawmessage: "private",
  },
})
await privateIncoming.reply("private-reply")
await privateIncoming.recall()
assert.equal(calls[2][0], "friend-reply")
assert.equal(calls[2][1].bot, bot)
assert.equal(calls[3][0], "friend-recall")
assert.equal(calls[3][1].bot, bot)

await saveMsgRecord(bot, {
  version: MESSAGE_RECORD_VERSION,
  direction: "incoming",
  scene: "group",
  self_id: "10000",
  msg_idx: "idx-1",
  message_id: "message-1",
  raw: sanitized,
})
const restored = await getRecordByMsgId(bot, "message-1")
assert.equal(restored.user_id, "USER_OPENID")
assert.equal(restored.sender.nickname, "测试用户")
assert.equal(typeof restored.reply, "function")

const messageIdKey = "QQBot:msgId:appid:message-1"
redisStore.delete(messageIdKey)
assert.equal(redisStore.has(messageIdKey), false)
assert.equal((await getRecordByMsgIdx(bot, "idx-1")).message_id, "message-1")
assert.equal(redisStore.has(messageIdKey), true)
assert.equal((await getRecordByMsgId(bot, "message-1")).user_id, "USER_OPENID")
const msgIdxKey = "QQBot:msgIdx:appid:idx-1"
redisStore.delete(msgIdxKey)
assert.equal(redisStore.has(msgIdxKey), false)
assert.equal((await getRecordByMsgId(bot, "message-1")).msg_idx, "idx-1")
assert.equal(redisStore.has(msgIdxKey), true)

await saveMsgRecord(bot, {
  version: MESSAGE_RECORD_VERSION,
  direction: "incoming",
  scene: "group",
  self_id: "10000",
  msg_idx: "idx-2",
  message_id: "message-reply",
  raw: sanitizeRawMessage({
    ...raw,
    messageid: "message-reply",
    messagescene: { ext: ["msgidx=idx-2", "refmsgidx=idx-1"] },
  }),
})
const quoted = await getRecordByMsgId(bot, "message-reply")
assert.equal(quoted.source.seq, "message-1")
assert.equal((await quoted.getReply()).raw_message, "hello")

const outgoing = await adaptMessageRecord(adapter, bot, {
  version: MESSAGE_RECORD_VERSION,
  direction: "outgoing",
  scene: "group",
  self_id: "10000",
  msg_idx: "idx-2",
  message_id: "message-2",
  raw: { id: "message-2", timestamp: 456 },
  payload: { message: [{ type: "text", text: "sent" }], raw_message: "sent" },
  context: {
    user_id: "10000",
    raw_user_id: "BOT_OPENID",
    group_id: "123456",
    raw_group_id: "GROUP_OPENID",
    nickname: "QQBot",
  },
})
assert.equal(outgoing.user_id, "10000")
assert.equal(outgoing.sender.bot, true)
assert.equal(outgoing.group_id, "123456")
assert.equal(outgoing.raw_message, "sent")

const legacy = await adaptMessageRecord(adapter, bot, {
  msgidx: "old-idx",
  messageid: "old-message",
  userid: "OLD_USER",
  rawuserid: "OLD_OPENID",
  groupid: "654321",
  rawgroupid: "OLD_GROUP_OPENID",
  sender: { userid: "OLD_USER", nickname: "旧缓存" },
  message: [{ type: "text", text: "legacy" }],
  rawmessage: "legacy",
})
assert.equal(legacy.message_id, "old-message")
assert.equal(legacy.user_id, "OLD_USER")
assert.equal(legacy.sender.user_id, "OLD_USER")

console.log("messageRecord tests passed")
