import assert from "node:assert/strict"
import { segment } from "qq-official-bot"
import { MessageService } from "../lib/modules/qq-official-bot/lib/services/message.js"

const payloads = []
let failNext = false
const request = {
  post: async (_url, payload) => {
    payloads.push(structuredClone(payload))
    if (failNext) {
      failNext = false
      throw new Error("send failed")
    }
    return { data: { id: `sent-${payloads.length}` }, status: 200 }
  },
}
const service = new MessageService(request, "appid")

await service.sendGroupMessage("group", "first", { id: "message-1" })
await service.sendGroupMessage("group", "second", { id: "message-1" })
await service.sendGroupMessage("group", "third", { id: "message-1" })
await service.sendGroupMessage("group", "fourth", { id: "message-1" })
await service.sendGroupMessage("group", "fifth", { id: "message-1" })
assert.deepEqual(payloads.slice(0, 5).map(payload => payload.msg_seq), [1, 2, 3, 4, 5])

await service.sendGroupMessage("group", "active")
assert.equal("msg_seq" in payloads[5], false)

await service.sendGroupMessage("group", [segment.reply("message-2"), "reply by segment"])
assert.equal(payloads[6].msg_seq, 1)

failNext = true
await assert.rejects(service.sendGroupMessage("group", "failed", { id: "message-3" }))
await service.sendGroupMessage("group", "retry", { id: "message-3" })
assert.equal(payloads[7].msg_seq, 1)
assert.equal(payloads[8].msg_seq, 1)

console.log("sdk msg_seq tests passed")
