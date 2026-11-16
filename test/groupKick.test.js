import assert from "node:assert/strict"
import { mock, test } from "node:test"
import { Bot as SdkBot } from "qq-official-bot"
import { GroupService } from "../lib/modules/qq-official-bot/lib/services/group.js"

// Run with: node --experimental-test-module-mocks --test test/groupKick.test.js
// All HTTP, host startup and persistence boundaries are mocked; no live members are removed.
const calls = []
let response = { remove_members_result: "success" }
let failure
const service = new GroupService({
  async post (url, body) {
    calls.push({ url, body: structuredClone(body) })
    if (failure) throw failure
    return { status: 200, data: response }
  },
})

await test("SDK sends the official payload and keeps the response, including at the 20-member limit", async () => {
  for (const members of [["member-openid"], Array.from({ length: 20 }, (_, i) => `member-${i}`)]) {
    assert.equal(await service.batchRemoveMembers("group-openid", members), response)
    assert.deepEqual(calls.at(-1), {
      url: "/v2/groups/group-openid/batch_remove_members",
      body: { member_openids: members },
    })
  }
  assert.equal(await SdkBot.prototype.batchRemoveGroupMembers.call(
    { groupService: service }, "group-openid", ["member-openid"],
  ), response)
})

await test("SDK rejects invalid requests before HTTP and does not split a 21-member request", async () => {
  const before = calls.length
  for (const members of [[], Array(21).fill("member"), undefined, "member", [""], [" "], [null], [12345], Array(1)])
    await assert.rejects(service.batchRemoveMembers("group", members))
  for (const group of ["", " ", undefined, 12345])
    await assert.rejects(service.batchRemoveMembers(group, ["member"]))
  assert.equal(calls.length, before)
})

await test("SDK preserves permission errors without retrying", async () => {
  for (const code of [40103011, 40103012]) {
    failure = Object.assign(new Error("permission denied"), { code, trace_id: "trace" })
    const before = calls.length
    await assert.rejects(service.batchRemoveMembers("group", ["member"]), error => error === failure)
    assert.equal(calls.length, before + 1)
  }
  failure = undefined
})

const config = { token: [], bot: {} }
mock.module(new URL("../lib/config.js", import.meta.url).href, { exports: { config } })
mock.module(new URL("../lib/converter.js", import.meta.url).href, { exports: { Converter: class {} } })
mock.module(new URL("../lib/client.js", import.meta.url).href, { exports: { connectBot: async () => {} } })
mock.module(new URL("../lib/messageSender.js", import.meta.url).href, { exports: { installMessageSender () {} } })
mock.module(new URL("../lib/messageStore.js", import.meta.url).href, { exports: { getRecordByMsgId: async () => undefined } })
mock.module(new URL("../lib/groupMap.js", import.meta.url).href, {
  exports: {
    loadMappingsFromFile: async () => {},
    translateGroupToOpenid: async (_bot, groupId) => groupId === "987654321" ? "mapped-group" : false,
  },
})
for (const app of ["bind", "groupBind"])
  mock.module(new URL(`../app/${app}.js`, import.meta.url).href, { exports: {} })
mock.module(new URL("../app/qrlogin.js", import.meta.url).href, { exports: { QRLoginPlugin: class {} } })

const previous = { Bot: global.Bot, logger: global.logger, redis: global.redis }
global.logger = { info () {}, yellow: value => value, green: value => value }
global.redis = {
  get: async key => key === "map:uin:appid:123456789"
    ? JSON.stringify({ appid: "appid", openid: "mapped-member" })
    : null,
}
const cachedMember = { user_id: "123456789", role: "member", _raw_user_id: "cached-member" }
const bot = {
  uin: "10000",
  info: { appid: "appid" },
  fl: new Map(),
  gl: new Map([["987654321", { _raw_group_id: "cached-group", member_role: "admin" }]]),
  gml: new Map([["987654321", new Map([["123456789", cachedMember]])]]),
  sdk: {
    batchRemoveGroupMembers: (group, members) => SdkBot.prototype.batchRemoveGroupMembers.call(
      { groupService: service }, group, members,
    ),
  },
}
global.Bot = { adapter: [], "10000": bot }
try {
  await import("../index.js")
  const adapter = Bot.adapter[0]
  bot.pickGroup = groupId => adapter.pickGroup(bot.uin, groupId)

  await test("plugin follows the framework's group and member kick interfaces with cached OpenIDs", async () => {
    const group = bot.pickGroup(987654321)
    assert.equal(group.is_admin, true)
    assert.equal(await group.pickMember(123456789).getInfo(), cachedMember)
    assert.equal(await group.kickMember(123456789, false), true)
    assert.deepEqual(calls.at(-1), {
      url: "/v2/groups/cached-group/batch_remove_members",
      body: { member_openids: ["cached-member"] },
    })
    assert.equal(await group.pickMember(123456789).kick(), true)
    assert.deepEqual(calls.at(-1).body, { member_openids: ["cached-member"] })
  })

  await test("plugin translates numeric IDs and accepts raw OpenIDs and a 20-member batch", async () => {
    bot.gl.delete("987654321")
    bot.gml.clear()
    const group = bot.pickGroup(987654321)
    assert.equal(await group.pickMember(123456789).getInfo(), undefined)
    assert.equal(await group.kickMember([123456789, "raw-member"]), true)
    assert.deepEqual(calls.at(-1), {
      url: "/v2/groups/mapped-group/batch_remove_members",
      body: { member_openids: ["mapped-member", "raw-member"] },
    })
    const members = Array.from({ length: 20 }, (_, i) => `raw-${i}`)
    assert.equal(await bot.pickGroup("raw-group").kickMember(members), true)
    assert.deepEqual(calls.at(-1), {
      url: "/v2/groups/raw-group/batch_remove_members",
      body: { member_openids: members },
    })
  })

  await test("plugin rejects invalid batches and blacklist requests before removing anyone", async () => {
    const group = bot.pickGroup(987654321)
    const before = calls.length
    for (const value of [[], Array(21).fill("member"), undefined, null, "", " ", {}, ["member", ""], Array(1), NaN, 0, "qg_member"])
      await assert.rejects(group.kickMember(value))
    await assert.rejects(group.kickMember(123456789, true), /不支持踢出并拉黑/)
    await assert.rejects(group.pickMember(123456789).kick(true), /不支持踢出并拉黑/)
    assert.equal(calls.length, before)
  })

  await test("plugin checks the response field and propagates API failures", async () => {
    const group = bot.pickGroup(987654321)
    for (const data of [{ remove_members_result: "failed" }, {}, null]) {
      response = data
      assert.equal(await group.kickMember(123456789), false)
    }
    response = { remove_members_result: "success" }
    failure = Object.assign(new Error("permission denied"), { code: 40103012 })
    await assert.rejects(group.kickMember(123456789), error => error === failure)
    failure = undefined
  })

  await test("framework getInfo reads only the current group cache and leaves missing members undefined", async () => {
    const member = bot.pickGroup(987654321).pickMember(123456789)
    const before = calls.length
    bot.fl.set("123456789", { nickname: "friend without group membership" })
    assert.equal(await member.getInfo(), undefined)
    bot.gml.set("987654321", new Map([["123456789", cachedMember]]))
    assert.equal(await member.getInfo(), cachedMember)
    assert.equal(await bot.pickGroup("other-group").pickMember(123456789).getInfo(), undefined)
    bot.gml.clear()
    assert.equal(await member.getInfo(), undefined)
    assert.equal(calls.length, before)
  })
} finally {
  mock.restoreAll()
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete global[key]
    else global[key] = value
  }
}
