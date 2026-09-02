import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const redisStore = new Map()
global.redis = {
  get: async key => redisStore.get(key) || null,
  set: async (key, value) => redisStore.set(key, value),
  del: async keys => {
    for (const key of Array.isArray(keys) ? keys : [keys]) redisStore.delete(key)
  },
}

const calls = []
let emitted
const adapter = {
  sendGroupMsg: async (data, message) => calls.push(["reply", data, message]),
  recallGroupMsg: async (data, messageId) => calls.push(["recall", data, messageId]),
  sendFriendMsg: async (data, message) => calls.push(["friend-reply", data, message]),
  recallFriendMsg: async (data, messageId) => calls.push(["friend-recall", data, messageId]),
  getGroupInfo: async data => ({ group_id: data.group_id, group_name: "测试群" }),
  setGroupMap: async () => {},
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
global.Bot = {
  10000: bot,
  em: (_name, data) => { emitted = data },
  makeLog: () => {},
}

const {
  MESSAGE_RECORD_VERSION,
  adaptMessageRecord,
  sanitizeRawMessage,
} = await import("../lib/messageRecord.js")
const {
  getRecordByMsgId,
  getRecordByMsgIdx,
  isReferenceMessageIndex,
  markMsgRecordRecalled,
  parseElementMessage,
  saveMsgRecord,
  setMessageStoreRoot,
} = await import("../lib/messageStore.js")
const { makeMessage } = await import("../lib/messageBuilder.js")

const messageStoreRoot = await fs.mkdtemp(path.join(os.tmpdir(), "qqbot-message-store-"))
setMessageStoreRoot(messageStoreRoot)

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
  auth_token: "top-secret",
  nested: { authToken: "nested-secret", keep: "kept" },
  messagescene: { ext: ["msgidx=idx-1", "authtoken=secret", "auth_token=secret-2"] },
}
const sanitized = sanitizeRawMessage(raw)
assert.deepEqual(sanitized.messagescene.ext, ["msgidx=idx-1"])
assert.equal("auth_token" in sanitized, false)
assert.equal("authToken" in sanitized.nested, false)
assert.equal(sanitized.nested.keep, "kept")

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
  direction: "incoming",
  scene: "group",
  self_id: "10000",
  time: 123,
  msg_idx: "idx-1",
  message_id: "message-1",
  group_openid: "GROUP_OPENID",
  sender: { user_openid: "USER_OPENID", nickname: "测试用户", role: "admin" },
  message: [
    { type: "at", qq: "123456", _raw_user_id: "AT_USER_OPENID", username: "被提及用户" },
    { type: "text", text: "hello" },
  ],
  raw_message: "hello",
  raw,
})
const groupScope = { groupOpenId: "GROUP_OPENID" }
const restored = await getRecordByMsgId(bot, "message-1", groupScope)
assert.equal(restored.user_id, "USER_OPENID")
assert.equal(restored.sender.nickname, "测试用户")
assert.equal(typeof restored.reply, "function")
assert.equal(restored.message[0].qq, "AT_USER_OPENID")
assert.equal(restored.message[0]._raw_user_id, "AT_USER_OPENID")

assert.equal((await getRecordByMsgIdx(bot, "idx-1", groupScope)).message_id, "message-1")
assert.equal((await getRecordByMsgId(bot, "message-1", groupScope)).msg_idx, "idx-1")
assert.equal(isReferenceMessageIndex("REFIDX_reference"), true)
assert.equal(isReferenceMessageIndex("TMP_reference"), true)
assert.equal(isReferenceMessageIndex("ROBOT1.0_message"), false)
assert.equal(await getRecordByMsgId(bot, "REFIDX_reference", groupScope), null)
assert.equal([...redisStore.keys()].some(key => key.startsWith("QQBot:msg")), false)

const groupFile = path.join(
  messageStoreRoot,
  "10000",
  "messages",
  "groups",
  "GROUP_OPENID",
  "1970-01-01.jsonl",
)
const firstStoredLine = JSON.parse((await fs.readFile(groupFile, "utf8")).trim())
assert.equal(firstStoredLine.group_openid, "GROUP_OPENID")
assert.equal(firstStoredLine.sender.user_openid, "USER_OPENID")
assert.equal(firstStoredLine.raw.messageid, "message-1")
assert.equal(firstStoredLine.raw.nested.keep, "kept")
assert.equal("auth_token" in firstStoredLine.raw, false)
assert.equal("authToken" in firstStoredLine.raw.nested, false)
assert.deepEqual(firstStoredLine.raw.messagescene.ext, ["msgidx=idx-1"])
assert.equal("user_id" in firstStoredLine.sender, false)
assert.equal(firstStoredLine.message[0].user_openid, "AT_USER_OPENID")
assert.equal("qq" in firstStoredLine.message[0], false)

await saveMsgRecord(bot, {
  direction: "incoming",
  scene: "private",
  self_id: "10000",
  time: 123,
  message_id: "private-stored",
  user_openid: "FRIEND_OPENID",
  sender: { user_openid: "FRIEND_OPENID", nickname: "好友" },
  message: [{ type: "text", text: "private" }],
  raw_message: "private",
})
const privateFile = path.join(
  messageStoreRoot,
  "10000",
  "messages",
  "users",
  "FRIEND_OPENID",
  "1970-01-01.jsonl",
)
assert.equal(JSON.parse((await fs.readFile(privateFile, "utf8")).trim()).user_openid, "FRIEND_OPENID")

await saveMsgRecord(bot, {
  direction: "outgoing",
  scene: "group",
  self_id: "10000",
  time: 125,
  msg_idx: "outgoing-idx",
  message_id: "outgoing-stored",
  group_openid: "GROUP_OPENID",
  sender: { user_openid: "BOT_OPENID", nickname: "QQBot", bot: true },
  message: [{ type: "text", text: "sent" }],
  raw_message: "sent",
  raw_request: {
    message_reference: { message_id: "message-1" },
    content: "sent",
    auth_token: "request-secret",
  },
  raw_response: {
    id: "outgoing-stored",
    ext_info: { ref_idx: "outgoing-idx" },
    authToken: "response-secret",
  },
})
const storedOutgoing = await getRecordByMsgId(bot, "outgoing-stored", groupScope)
assert.equal(storedOutgoing.raw_request.content, "sent")
assert.equal(storedOutgoing.raw_response.id, "outgoing-stored")
assert.equal("auth_token" in storedOutgoing.raw_request, false)
assert.equal("authToken" in storedOutgoing.raw_response, false)
assert.equal(storedOutgoing.raw.id, "outgoing-stored")

await saveMsgRecord(bot, {
  direction: "incoming",
  scene: "group",
  self_id: "10000",
  time: 124,
  msg_idx: "idx-2",
  ref_msg_idx: "idx-1",
  message_id: "message-reply",
  group_openid: "GROUP_OPENID",
  sender: { user_openid: "USER_OPENID", nickname: "测试用户" },
  message: [{ type: "text", text: "reply" }],
  raw_message: "reply",
})
const quoted = await getRecordByMsgId(bot, "message-reply", groupScope)
assert.equal(quoted.source.seq, "message-1")
assert.equal((await quoted.getReply()).raw_message, "hello")

const attachmentElement = {
  msg_idx: "missing-image-idx",
  content: "",
  attachments: [{
    content: "",
    content_type: "image/jpeg",
    filename: "test.jpg",
    width: 4037,
    height: 2000,
    size: 691538,
    url: "https://multimedia.nt.qq.com.cn/download?test",
  }],
}
assert.deepEqual(parseElementMessage(attachmentElement), [{
  type: "image",
  url: "https://multimedia.nt.qq.com.cn/download?test",
  file: "https://multimedia.nt.qq.com.cn/download?test",
  name: "test.jpg",
  width: 4037,
  height: 2000,
  size: 691538,
}])

await makeMessage(adapter, "10000", {
  post_type: "message",
  message_type: "group",
  sub_type: "normal",
  message_id: "live-image-reply",
  raw_message: "图里有什么",
  message: [{ type: "text", data: { text: "图里有什么" } }],
  sender: { user_id: "USER_OPENID", permissions: ["normal"] },
  author: { username: "测试用户", member_role: "member" },
  group_id: "GROUP_OPENID",
  timestamp: 789,
  message_scene: {
    ext: [
      "msg_idx=live-image-reply-idx",
      "ref_msg_idx=missing-live-image-idx",
      "auth_token=live-secret",
    ],
  },
  msg_elements: [{ ...attachmentElement, msg_idx: "missing-live-image-idx" }],
})
assert.equal(emitted.source.message, "[图片]")
assert.equal(Object.hasOwn(emitted.source, "seq"), false)
assert.deepEqual((await emitted.getReply()).message, parseElementMessage(attachmentElement))
assert.equal((await emitted.getReply()).msg_idx, "missing-live-image-idx")
const liveStoredRecord = (await fs.readFile(groupFile, "utf8"))
  .trim()
  .split(/\r?\n/)
  .map(line => JSON.parse(line))
  .find(record => record.message_id === "live-image-reply")
assert.equal(liveStoredRecord.raw.msg_elements[0].attachments[0].filename, "test.jpg")
assert.deepEqual(liveStoredRecord.raw.message_scene.ext, [
  "msg_idx=live-image-reply-idx",
  "ref_msg_idx=missing-live-image-idx",
])

await makeMessage(adapter, "10000", {
  id: "ROBOT1.0_official-message-id",
  message_id: "REFIDX_not-a-message-id",
  post_type: "message",
  message_type: "group",
  sub_type: "normal",
  raw_message: "官方 ID 优先",
  message: [{ type: "text", data: { text: "官方 ID 优先" } }],
  sender: { user_id: "USER_OPENID", permissions: ["normal"] },
  author: { username: "测试用户", member_role: "member" },
  group_id: "GROUP_OPENID",
  timestamp: 790,
  message_scene: { ext: ["msg_idx=official-id-idx"] },
})
assert.equal(emitted.message_id, "ROBOT1.0_official-message-id")
assert.equal(
  (await getRecordByMsgId(bot, "ROBOT1.0_official-message-id", groupScope)).raw_message,
  "官方 ID 优先",
)
assert.equal(await getRecordByMsgId(bot, "REFIDX_not-a-message-id", groupScope), null)
assert.equal(await markMsgRecordRecalled(bot, "REFIDX_not-a-message-id", groupScope), false)

const officialRawId = await adaptMessageRecord(adapter, bot, {
  version: MESSAGE_RECORD_VERSION,
  direction: "incoming",
  scene: "group",
  self_id: "10000",
  raw: {
    id: "ROBOT1.0_raw-official-id",
    message_id: "REFIDX_raw-reference-index",
    group_id: "GROUP_OPENID",
    user_id: "USER_OPENID",
    timestamp: 791,
    message: [{ type: "text", text: "raw id" }],
  },
})
assert.equal(officialRawId.message_id, "ROBOT1.0_raw-official-id")

await makeMessage(adapter, "10000", {
  id: "ROBOT1.0_exact-reference-reply",
  post_type: "message",
  message_type: "group",
  sub_type: "normal",
  raw_message: "精确引用",
  message: [{ type: "text", data: { text: "精确引用" } }],
  sender: { user_id: "USER_OPENID", permissions: ["normal"] },
  author: { username: "测试用户", member_role: "member" },
  group_id: "GROUP_OPENID",
  timestamp: 792,
  message_scene: { ext: ["msg_idx=exact-reference-reply-idx", "ref_msg_idx=idx-1"] },
})
assert.equal(emitted.source.seq, "message-1")
assert.equal(emitted.source.message, "hello")

assert.equal(await markMsgRecordRecalled(bot, "message-1", groupScope), true)
assert.equal(await getRecordByMsgId(bot, "message-1", groupScope), null)
const storedAfterRecall = (await Promise.all(
  (await fs.readdir(path.dirname(groupFile)))
    .filter(file => file.endsWith(".jsonl"))
    .map(file => fs.readFile(path.join(path.dirname(groupFile), file), "utf8")),
))
  .flatMap(content => content.trim().split(/\r?\n/))
  .filter(Boolean)
  .map(line => JSON.parse(line))
assert.equal(storedAfterRecall.some(record => record.type === "message" && record.message_id === "message-1"), true)
assert.equal(storedAfterRecall.some(record => record.type === "recall" && record.message_id === "message-1"), true)

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
