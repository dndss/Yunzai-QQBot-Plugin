/**
 * 群映射存储模块
 * 将 QQBot 群 OpenID 映射到真实 QQ 群号，支持 Redis + JSON 双写架构。
 *
 * Redis Key 设计：
 *   正向：map:group:<appid>:<group_openid>     → 真实群号
 *   反向：map:group_uin:<appid>:<真实群号>      → group_openid
 *
 * 存储文件：data/QQBot/group-mappings.json
 *
 * 读操作：优先 Redis，未命中则回退 JSON 文件保底
 * 写操作：Redis + JSON 双写
 * 启动时：JSON 文件 → 全量重建 Redis
 */

import { getAppid, isQQUin } from "./uinMap.js"
import fs from "node:fs"
import path from "node:path"

const GROUP_MAP_FILE = "data/QQBot/group-mappings.json"
const GROUP_MAP_PREFIX = "map:group"
const GROUP_MAP_UIN_PREFIX = "map:group_uin"

/**
 * 构建正向 Redis Key
 * @param {string} appid - Bot 的 appid
 * @param {string} groupOpenid - 群 openid
 * @returns {string} map:group:<appid>:<group_openid>
 */
function getGroupKey (appid, groupOpenid) {
  return `${GROUP_MAP_PREFIX}:${appid}:${groupOpenid}`
}

/**
 * 构建反向 Redis Key
 * @param {string} appid - Bot 的 appid
 * @param {string} groupUin - 真实 QQ 群号
 * @returns {string} map:group_uin:<appid>:<真实群号>
 */
function getGroupUinKey (appid, groupUin) {
  return `${GROUP_MAP_UIN_PREFIX}:${appid}:${groupUin}`
}

/**
 * 读取群映射 JSON 文件（保底用）
 * @returns {Record<string, Record<string, string>>} { appid: { group_openid: 群号 } }
 */
function readGroupMap () {
  const filePath = path.resolve(GROUP_MAP_FILE)
  if (!fs.existsSync(filePath)) return {}
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch (err) {
    Bot.makeLog?.("error", ["[groupMap] 读取映射文件失败", filePath, err])
    return {}
  }
}

/**
 * 全量写入群映射 JSON 文件
 * @param {Record<string, Record<string, string>>} data - 完整映射数据
 */
function writeGroupMap (data) {
  try {
    const filePath = path.resolve(GROUP_MAP_FILE)
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8")
  } catch (err) {
    Bot.makeLog?.("error", ["[groupMap] 写入映射文件失败", err])
  }
}

/**
 * 增量同步单条映射到 JSON 文件
 * 读取现有文件 → 更新对应条目 → 全量写回
 *
 * @param {string} appid - Bot 的 appid
 * @param {string} groupOpenid - 群 openid
 * @param {string} groupUin - 真实 QQ 群号
 */
function syncToJsonFile (appid, groupOpenid, groupUin) {
  try {
    const raw = readGroupMap()
    if (!raw[appid]) raw[appid] = {}
    raw[appid][groupOpenid] = String(groupUin)
    writeGroupMap(raw)
  } catch (err) {
    Bot.makeLog?.("error", ["[groupMap] 同步映射到文件失败", appid, groupOpenid, groupUin, err])
  }
}

/**
 * 保存群映射：group_openid → 真实群号
 * 双写 Redis（正向+反向键）与 JSON 文件
 *
 * @param {string} appid - Bot 的 appid
 * @param {string} groupOpenid - QQBot 群的 openid
 * @param {string} groupUin - 真实 QQ 群号（必须是合法的 5-12 位数字）
 * @returns {Promise<boolean>} 是否保存成功
 */
export async function saveGroupMapping (appid, groupOpenid, groupUin) {
  if (!appid || !groupOpenid || !isQQUin(groupUin)) return false

  const uin = String(groupUin)
  const openid = String(groupOpenid)

  // 双写：Redis（正向 + 反向键）
  if (global.redis) {
    try {
      await redis.set(getGroupKey(appid, openid), uin)
      await redis.set(getGroupUinKey(appid, uin), openid)
    } catch (err) {
      Bot.makeLog?.("error", ["[groupMap] 保存映射到Redis失败", appid, openid, uin, err])
    }
  }

  // 双写：JSON 文件
  syncToJsonFile(appid, openid, uin)

  return true
}

/**
 * 查询群映射：group_openid → 真实群号
 * 优先 Redis（O(1)），未命中则回退 JSON 文件保底
 *
 * @param {string} appid - Bot 的 appid
 * @param {string} groupOpenid - 群 openid
 * @returns {Promise<string|false>} 真实群号，未找到返回 false
 */
export async function getGroupMapping (appid, groupOpenid) {
  if (!appid || !groupOpenid) return false

  const openid = String(groupOpenid)

  // 优先 Redis
  if (global.redis) {
    try {
      const cached = await redis.get(getGroupKey(appid, openid))
      if (cached) return cached
    } catch (err) {
      Bot.makeLog?.("error", ["[groupMap] Redis查询映射失败", appid, openid, err])
    }
  }

  // 回退 JSON 文件
  try {
    const raw = readGroupMap()
    return raw[appid]?.[openid] || false
  } catch (err) {
    Bot.makeLog?.("error", ["[groupMap] 文件查询映射失败", appid, openid, err])
    return false
  }
}

/**
 * 从 bot 实例获取群映射（group_openid → 真实群号）
 *
 * @param {string|object} botOrId - Bot 实例或 bot ID 字符串
 * @param {string} groupOpenid - 群 openid
 * @returns {Promise<string|false>} 真实群号，未找到返回 false
 */
export async function getGroupUin (botOrId, groupOpenid) {
  if (!groupOpenid) return false
  const appid = getAppid(botOrId)
  if (!appid) return false
  return getGroupMapping(appid, groupOpenid)
}

/**
 * 反向映射：真实群号 → group_openid
 * 用于 sendGroupMsg 等需要 OpenID 调用官方 SDK 的场景。
 * 优先 Redis 反向键 map:group_uin: 实现 O(1) 查询，
 * 未命中则回退 JSON 文件遍历（仅极端保底）。
 *
 * @param {string|object} botOrId - Bot 实例或 bot ID 字符串
 * @param {string} groupUin - 真实 QQ 群号
 * @returns {Promise<string|false>} group_openid，未找到返回 false
 */
export async function translateGroupToOpenid (botOrId, groupUin) {
  if (!groupUin || !isQQUin(groupUin)) return false

  const appid = getAppid(botOrId)
  if (!appid) return false

  const uin = String(groupUin)

  // 优先 Redis 反向键（O(1)）
  if (global.redis) {
    try {
      const cached = await redis.get(getGroupUinKey(appid, uin))
      if (cached) return cached
    } catch (err) {
      Bot.makeLog?.("error", ["[groupMap] Redis反向查询失败", appid, uin, err])
    }
  }

  // 回退 JSON 文件遍历（极端保底，正常情况下不会走到这里）
  try {
    const raw = readGroupMap()
    const appMap = raw[appid]
    if (!appMap) return false
    for (const openid of Object.keys(appMap)) {
      if (appMap[openid] === uin) return openid
    }
    return false
  } catch (err) {
    Bot.makeLog?.("error", ["[groupMap] 文件反向查询失败", appid, uin, err])
    return false
  }
}

/**
 * 从 JSON 文件全量重建 Redis 映射
 * 启动时调用，以文件为唯一真相源：
 *   1. 清空 Redis 中所有旧群映射 key
 *   2. 遍历 JSON 文件，逐条写入 Redis（正向 + 反向键）
 * 避免 Redis 丢失后映射失效。
 *
 * @param {string} [filePath] - 映射文件路径，默认 data/QQBot/group-mappings.json
 * @returns {Promise<number>} 成功加载的映射条数
 */
export async function loadMappingsFromFile (filePath) {
  if (!global.redis) return 0

  const resolved = path.resolve(filePath || GROUP_MAP_FILE)

  // 清空 Redis 中所有旧群映射，以文件为唯一真相源全量重建
  try {
    const groupKeys = await redis.keys(`${GROUP_MAP_PREFIX}:*`)
    const groupUinKeys = await redis.keys(`${GROUP_MAP_UIN_PREFIX}:*`)
    const allKeys = [...groupKeys, ...groupUinKeys]
    if (allKeys.length > 0) {
      await redis.del(allKeys)
      Bot.makeLog?.("info", [`[groupMap] 已清理 Redis 旧映射，共 ${allKeys.length} 个 key，准备从文件全量重建`])
    }
  } catch (err) {
    Bot.makeLog?.("error", ["[groupMap] 清理 Redis 旧映射失败", err])
  }

  if (!fs.existsSync(resolved)) {
    Bot.makeLog?.("info", [`[groupMap] 映射文件不存在，Redis 已清空，跳过加载`, resolved])
    return 0
  }

  let raw
  try {
    raw = JSON.parse(fs.readFileSync(resolved, "utf8"))
  } catch (err) {
    Bot.makeLog?.("error", ["[groupMap] 映射文件解析失败", resolved, err])
    return 0
  }

  if (!raw || typeof raw !== "object") return 0

  let count = 0
  for (const appid of Object.keys(raw)) {
    const map = raw[appid]
    if (!map || typeof map !== "object") continue
    for (const openid of Object.keys(map)) {
      const uin = String(map[openid] || "")
      if (!isQQUin(uin)) {
        Bot.makeLog?.("warn", ["[groupMap] 映射文件跳过非法群号", appid, openid, uin])
        continue
      }
      try {
        await redis.set(getGroupKey(appid, openid), uin)
        await redis.set(getGroupUinKey(appid, uin), openid)
        count++
      } catch (err) {
        Bot.makeLog?.("error", ["[groupMap] 映射文件写入Redis失败", appid, openid, uin, err])
      }
    }
  }

  Bot.makeLog?.("info", [`[groupMap] 映射文件加载完成：${resolved}，共 ${count} 条映射`])
  return count
}
