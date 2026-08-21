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

function openApiError (code, message) {
  return Object.assign(new Error(message), { code, err_code: code })
}

function createService (responses) {
  const sentPayloads = []
  const request = {
    post: async (_url, payload) => {
      sentPayloads.push(structuredClone(payload))
      const response = responses.shift()
      if (response instanceof Error) throw response
      return { data: response || { id: `sent-${sentPayloads.length}` }, status: 200 }
    },
  }
  return {
    service: new MessageService(request, "appid"),
    payloads: sentPayloads,
  }
}

const duplicatedThenSuccess = createService([
  openApiError(40054005, "msg_seq 1 duplicated"),
  openApiError(40054005, "msg_seq 2 duplicated"),
  { id: "sent-after-sequence-retry" },
])
await duplicatedThenSuccess.service.sendGroupMessage("group", "retry duplicated", { id: "duplicate-1" })
assert.deepEqual(duplicatedThenSuccess.payloads.map(payload => payload.msg_seq), [1, 2, 3])

const allDuplicated = createService(Array.from(
  { length: 5 },
  (_, index) => openApiError(40054005, `msg_seq ${index + 1} duplicated`),
))
await assert.rejects(
  allDuplicated.service.sendGroupMessage("group", "all duplicated", { id: "duplicate-all" }),
  error => error.code === 40054005,
)
assert.deepEqual(allDuplicated.payloads.map(payload => payload.msg_seq), [1, 2, 3, 4, 5])

const expiredReply = createService([
  openApiError(40034005, "reply msg_id expired"),
  { id: "sent-as-active" },
])
await expiredReply.service.sendGroupMessage("group", "expired reply", { id: "expired-message" })
assert.equal(expiredReply.payloads[0].msg_id, "expired-message")
assert.equal(expiredReply.payloads[0].msg_seq, 1)
assert.equal("msg_id" in expiredReply.payloads[1], false)
assert.equal("msg_seq" in expiredReply.payloads[1], false)

const quotedFallback = createService([
  new Error("passive quote failed"),
  { id: "sent-as-active-quote" },
])
await quotedFallback.service.sendGroupMessage("group", [
  segment.reply("quoted-message", true, "quoted-index"),
  "quoted reply",
])
assert.equal(quotedFallback.payloads[0].msg_id, "quoted-message")
assert.deepEqual(quotedFallback.payloads[0].message_reference, { message_id: "quoted-index" })
assert.equal("msg_id" in quotedFallback.payloads[1], false)
assert.equal("msg_seq" in quotedFallback.payloads[1], false)
assert.deepEqual(quotedFallback.payloads[1].message_reference, { message_id: "quoted-index" })

const quotedDuplicatesFallback = createService([
  ...Array.from(
    { length: 5 },
    (_, index) => openApiError(40054005, `quoted msg_seq ${index + 1} duplicated`),
  ),
  { id: "sent-as-active-after-duplicates" },
])
await quotedDuplicatesFallback.service.sendGroupMessage("group", [
  segment.reply("quoted-duplicate", true, "quoted-duplicate-index"),
  "quoted duplicate reply",
])
assert.deepEqual(
  quotedDuplicatesFallback.payloads.slice(0, 5).map(payload => payload.msg_seq),
  [1, 2, 3, 4, 5],
)
assert.equal("msg_id" in quotedDuplicatesFallback.payloads[5], false)
assert.deepEqual(
  quotedDuplicatesFallback.payloads[5].message_reference,
  { message_id: "quoted-duplicate-index" },
)

const activeReference = createService([{ id: "sent-active-reference" }])
await activeReference.service.sendGroupMessage("group", [
  { type: "reply", data: { msg_idx: "active-reference-index" } },
  "active reference",
])
assert.equal("msg_id" in activeReference.payloads[0], false)
assert.equal("msg_seq" in activeReference.payloads[0], false)
assert.deepEqual(
  activeReference.payloads[0].message_reference,
  { message_id: "active-reference-index" },
)

console.log("sdk msg_seq tests passed")
