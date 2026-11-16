import assert from "node:assert/strict"
import { test } from "node:test"
import { Bot, UserService } from "qq-official-bot"

// Run with: node --test test/sdkUserInfo.test.js
// Use the linked SDK package with a fake HTTP client; never read live bot credentials.
const calls = []
const service = new UserService({
  async get (...args) {
    calls.push(args)
    if (failure) throw failure
    return { status: 200, data: response }
  },
})
let response
let failure

await test("user info uses the official GET path and preserves all returned fields", async () => {
  for (const allowProactive of [false, true]) {
    response = {
      union_openid: "union-openid",
      username: "测试😊用户",
      avatar: "https://thirdqq.qlogo.cn/bqqthird?key=test&kti=test&s=640",
      allow_proactive_msg: allowProactive,
    }
    const result = await service.getInfo("user-openid")
    assert.equal(result, response)
    assert.deepEqual(calls.at(-1), ["/v2/users/user-openid/info"])
    assert.equal(result.allow_proactive_msg, allowProactive)
    assert.equal(Object.hasOwn(result, "user_id"), false)
    assert.equal(Object.hasOwn(result, "role"), false)
  }
})

await test("user info keeps an absent union_openid absent", async () => {
  response = { username: "用户", avatar: "https://example.test/avatar", allow_proactive_msg: false }
  const result = await service.getInfo("user-openid")
  assert.equal(result, response)
  assert.equal(Object.hasOwn(result, "union_openid"), false)
})

await test("Bot getUserInfo and getFriendInfo delegate to the same user service", async () => {
  for (const method of ["getUserInfo", "getFriendInfo"]) {
    const before = calls.length
    assert.equal(await Bot.prototype[method].call({ userService: service }, "user-openid"), response)
    assert.equal(calls.length, before + 1)
    assert.deepEqual(calls.at(-1), ["/v2/users/user-openid/info"])
  }
})

await test("user info rejects an invalid OpenID before HTTP", async () => {
  const before = calls.length
  for (const value of [undefined, null, "", " \t", 12345, {}, []])
    await assert.rejects(service.getInfo(value), TypeError)
  assert.equal(calls.length, before)
})

await test("user info preserves the no-friend error without retries or fabricated data", async () => {
  failure = Object.assign(new Error("no friend relationship"), { code: 40184001, err_code: 40184001, trace_id: "trace" })
  for (const method of ["getUserInfo", "getFriendInfo"]) {
    const before = calls.length
    await assert.rejects(Bot.prototype[method].call({ userService: service }, "user-openid"), error => error === failure)
    assert.equal(calls.length, before + 1)
  }
  failure = undefined
})
