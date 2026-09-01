/**
 * 为私聊事件的流式回复补充被动回复凭据。
 * 显式传入的 msg_id/event_id 始终优先；普通消息优先使用 msg_id，
 * 互动事件使用 event_id。
 */
export function makeStreamReplyPayload (payload, source = {}) {
  const result = { ...payload }
  if (result.msg_id || result.event_id) return result

  const messageId = source.message_id
  if (messageId && !String(messageId).startsWith("event_")) {
    result.msg_id = messageId
    return result
  }

  const eventId = source.event_id || String(messageId || "").replace(/^event_/, "")
  if (eventId) result.event_id = eventId
  return result
}
