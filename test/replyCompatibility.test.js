import assert from "node:assert/strict"

global.Bot = {
  String: value => String(value),
}

const { Converter } = await import("../lib/converter.js")

const converter = new Converter({
  config: {
    forceVerifyImageResource: false,
  },
})
const data = {
  self_id: "10000",
  message_id: "message-1",
  raw: {
    id: "message-1",
    msg_idx: "idx-1",
  },
}

const passive = await converter.makeRawMarkdownMsg(data, "普通回复")
assert.equal(passive[0][0].type, "reply")
assert.deepEqual(passive[0][0].data, { id: "message-1" })

const quoted = await converter.makeRawMarkdownMsg(data, [
  { type: "reply", id: "message-1" },
  "引用回复",
])
assert.equal(quoted[0][0].type, "reply")
assert.equal(quoted[0][0].data.id, "message-1")
assert.equal(quoted[0][0].data.msg_idx, "idx-1")

console.log("reply compatibility tests passed")
process.exit(0)
