import assert from "node:assert/strict"
import { Session } from "../lib/modules/qq-official-bot/lib/core/session.js"
import { ReceiverMode } from "../lib/modules/qq-official-bot/lib/receivers/base.js"

const invalidCredentialError = Object.assign(
  new Error("invalid appid or secret"),
  { code: 100016, err_code: 100016 },
)

const bot = {
  config: {
    appid: "invalid-appid",
    secret: "invalid-secret",
    mode: ReceiverMode.WEBSOCKET,
  },
  logger: {
    trace () {},
    debug () {},
    info () {},
    mark () {},
    warn () {},
    error () {},
    fatal () {},
  },
  request: {
    post: async () => { throw invalidCredentialError },
  },
  dispatchEvent () {},
}

const session = new Session(bot)
const result = await Promise.race([
  session.start().then(
    () => ({ status: "resolved" }),
    error => ({ status: "rejected", error }),
  ),
  new Promise(resolve => setTimeout(() => resolve({ status: "timeout" }), 5000)),
])

assert.equal(result.status, "rejected")
assert.match(result.error.message, /invalid appid or secret/)

console.log("sdk start failure tests passed")
