import assert from "node:assert/strict"
import { mock } from "node:test"

// Run with: node --experimental-test-module-mocks test/groupBind.test.js
const command = "#\u7fa4\u7ed1\u5b9a"
const savedMappings = []
const mappingQueries = []
const replies = []
const listeners = new Map()
let currentMapping = false

global.Bot = {
  on: (name, handler) => listeners.set(name, handler),
  makeLog () {},
}
global.segment = {
  button: buttons => ({ type: "button", buttons }),
}

mock.module(new URL("../../../lib/config/config.js", import.meta.url).href, {
  exports: { default: { master: { "10000": ["123456789"] } } },
})
mock.module(new URL("../lib/uinMap.js", import.meta.url).href, {
  exports: { getAppid: bot => bot.info.appid },
})
mock.module(new URL("../lib/groupMap.js", import.meta.url).href, {
  exports: {
    saveGroupMapping: async (...args) => {
      savedMappings.push(args)
      return true
    },
    getGroupMapping: async (...args) => {
      mappingQueries.push(args)
      return currentMapping
    },
  },
})

await import("../app/groupBind.js")
const handleMessage = listeners.get("message.group.normal")
assert.equal(typeof handleMessage, "function")

async function dispatch (overrides = {}) {
  savedMappings.length = 0
  mappingQueries.length = 0
  replies.length = 0
  await handleMessage({
    bot: { adapter: { id: "QQBot" }, info: { appid: "appid" } },
    self_id: "10000",
    message_type: "group",
    user_id: "123456789",
    group_id: "old-group-uin",
    _raw_group_id: "group-openid",
    reply: async message => { replies.push(message) },
    ...overrides,
  })
}

const at = { type: "at", qq: "10000", is_you: true }
const text = value => ({ type: "text", text: value })
const bindText = `${command}987654321`

for (const [raw_message, message] of [
  [`<at,user_id=10000> ${bindText}`, [at, text(` ${bindText} `)]],
  [`${bindText} <at,user_id=10000>`, [text(bindText), at]],
  [`${command}<at,user_id=10000>987654321`, [text(command), at, text("987654321")]],
  [`<reply,id=old><at,user_id=10000> ${bindText}`, [
    { type: "reply", id: "old" }, at, text(bindText),
  ]],
  [bindText, [text(bindText)]],
  [bindText, undefined],
  [bindText, []],
]) {
  await dispatch({ raw_message, message })
  assert.deepEqual(savedMappings, [["appid", "group-openid", "987654321"]])
  assert.equal(replies.length, 1)
  assert.match(replies[0], /987654321/)
}

for (const mapping of [false, "987654321"]) {
  currentMapping = mapping
  await dispatch({
    raw_message: `<at,user_id=10000> ${command}`,
    message: [at, text(` ${command} `)],
  })
  assert.equal(savedMappings.length, 0)
  assert.deepEqual(mappingQueries, [["appid", "group-openid"]])
  assert.equal(replies.length, 1)
  assert.equal(replies[0][1].type, "button")
  assert.equal(replies[0][1].buttons[0].input, `${command} `)
  if (mapping) assert.match(replies[0][0], /987654321/)
}

// Group roles authorize raw OpenID users without a personal QQ binding.
for (const role of ["owner", "admin"]) {
  await dispatch({
    user_id: "unbound-user-openid",
    sender: { user_id: "unbound-user-openid", role },
    raw_message: bindText,
    message: [at, text(bindText)],
  })
  assert.deepEqual(savedMappings, [["appid", "group-openid", "987654321"]])
  assert.equal(mappingQueries.length, 0)
  assert.equal(replies.length, 1)
  assert.match(replies[0], /987654321/)

  for (const mapping of [false, "987654321"]) {
    currentMapping = mapping
    await dispatch({
      user_id: "unbound-user-openid",
      sender: { user_id: "unbound-user-openid", role },
      raw_message: command,
      message: [at, text(command)],
    })
    assert.equal(savedMappings.length, 0)
    assert.deepEqual(mappingQueries, [["appid", "group-openid"]])
    assert.equal(replies.length, 1)
    assert.equal(replies[0][1].type, "button")
    if (mapping) assert.match(replies[0][0], /987654321/)
  }
}

// A master remains authorized even without a privileged group role.
for (const value of [bindText, command]) {
  await dispatch({
    sender: { user_id: "123456789", role: "member" },
    raw_message: value,
    message: [text(value)],
  })
  assert.equal(replies.length, 1)
  assert.equal(savedMappings.length, value === bindText ? 1 : 0)
  assert.equal(mappingQueries.length, value === command ? 1 : 0)
}

// Ordinary, missing and unknown roles cannot bind or view a group's mapping.
for (const role of ["member", undefined, "unknown"]) {
  for (const value of [bindText, command]) {
    await dispatch({
      user_id: "unbound-user-openid",
      sender: { user_id: "unbound-user-openid", role },
      raw_message: value,
      message: [text(value)],
    })
    assert.equal(savedMappings.length, 0)
    assert.equal(mappingQueries.length, 0)
    assert.equal(replies.length, 0)
  }
}

for (const overrides of [
  { user_id: "other-user" },
  { user_id: "other-user", raw_message: command, message: [at, text(command)] },
  { message_type: "private" },
  { bot: { adapter: { id: "other-adapter" } } },
  { raw_message: "<at,user_id=10000> hello", message: [at, text("hello")] },
  { raw_message: "<at,user_id=10000>", message: [at] },
]) {
  await dispatch({
    raw_message: `<at,user_id=10000> ${bindText}`,
    message: [at, text(bindText)],
    ...overrides,
  })
  assert.equal(savedMappings.length, 0)
  assert.equal(mappingQueries.length, 0)
  assert.equal(replies.length, 0)
}

mock.restoreAll()
console.log("group bind tests passed")
