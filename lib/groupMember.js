import { getAppid } from "./uinMap.js"

const CACHE_TTL = 5 * 60 * 1000
const STALE_TTL = 60 * 60 * 1000
const FAILURE_TTL = 30 * 1000
const REQUEST_TIMEOUT = 3000
const MAX_CACHE_SIZE = 5000

const cache = new Map()
const pending = new Map()
const failures = new Map()

function getBot(botOrId) {
  return typeof botOrId === "object" ? botOrId : Bot?.[botOrId]
}

function getCacheKey(bot, groupOpenid, memberOpenid) {
  return `${getAppid(bot)}:${groupOpenid}:${memberOpenid}`
}

function normalizeMemberInfo(info, memberOpenid) {
  if (!info || typeof info !== "object") return false

  const role = info.member_role || info.role
  const joinedAt = info.joined_at
  const joinTime = Number.isFinite(info.join_time)
    ? info.join_time
    : joinedAt
      ? new Date(joinedAt).getTime() / 1000
      : undefined

  return {
    ...info,
    member_id: String(info.member_id || info.member_openid || memberOpenid),
    member_openid: String(info.member_openid || info.member_id || memberOpenid),
    username: info.username ? String(info.username) : "",
    role,
    member_role: role,
    join_time: Number.isFinite(joinTime) ? joinTime : undefined,
  }
}

function pruneCache(now) {
  for (const [key, value] of cache) {
    if (value.staleUntil <= now) cache.delete(key)
  }
  for (const [key, expiresAt] of failures) {
    if (expiresAt <= now) failures.delete(key)
  }
  while (cache.size >= MAX_CACHE_SIZE) {
    cache.delete(cache.keys().next().value)
  }
}

function pruneCacheIfNeeded(now) {
  if (cache.size >= MAX_CACHE_SIZE || failures.size >= MAX_CACHE_SIZE) {
    pruneCache(now)
  }
}

async function refreshMemberInfo(bot, groupOpenid, memberOpenid, key, stale) {
  if (pending.has(key)) return pending.get(key)

  const request = (async () => {
    try {
      const info = normalizeMemberInfo(
        await bot.sdk.getGroupMemberInfo(groupOpenid, memberOpenid, {
          timeout: REQUEST_TIMEOUT,
        }),
        memberOpenid,
      )
      if (!info) return stale?.value || false

      const now = Date.now()
      pruneCacheIfNeeded(now)
      cache.set(key, {
        value: info,
        expiresAt: now + CACHE_TTL,
        staleUntil: now + STALE_TTL,
      })
      failures.delete(key)
      return info
    } catch (err) {
      const now = Date.now()
      pruneCacheIfNeeded(now)
      failures.set(key, now + FAILURE_TTL)
      Bot.makeLog?.(
        "debug",
        ["QQBot 群成员详情查询失败", groupOpenid, memberOpenid, err],
        bot.uin,
      )
      return stale?.value || false
    } finally {
      pending.delete(key)
    }
  })()

  pending.set(key, request)
  return request
}

export async function getGroupMemberInfo(botOrId, groupOpenid, memberOpenid) {
  const bot = getBot(botOrId)
  if (!bot?.sdk?.getGroupMemberInfo || !groupOpenid || !memberOpenid) return false

  const key = getCacheKey(bot, groupOpenid, memberOpenid)
  const now = Date.now()
  const cached = cache.get(key)
  if (cached?.expiresAt > now) return cached.value

  if (cached?.staleUntil > now) {
    void refreshMemberInfo(bot, groupOpenid, memberOpenid, key, cached)
    return cached.value
  }

  cache.delete(key)
  if ((failures.get(key) || 0) > now) return false
  failures.delete(key)
  return refreshMemberInfo(bot, groupOpenid, memberOpenid, key)
}
