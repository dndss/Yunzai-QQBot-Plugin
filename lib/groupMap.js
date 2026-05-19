/**
 * 群映射存储模块 — 独立于 uinMap.js
 * 将 QQBot 群 OpenID 映射到真实 QQ 群号
 * 存储文件：data/QQBot/group-mappings.json
 */

import { getAppid } from "./uinMap.js"

const GROUP_MAP_FILE = "data/QQBot/group-mappings.json"

/**
 * 读取群映射 JSON 文件
 * @returns {Record<string, Record<string, string>>}  { appid: { group_openid: 群号 } }
 */
async function readGroupMap () {
  const fs = await import("node:fs")
  const path = await import("node:path")
  const filePath = path.resolve(GROUP_MAP_FILE)
  if (!fs.existsSync(filePath)) return {}
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch {
    return {}
  }
}

/**
 * 写入群映射 JSON 文件
 */
async function writeGroupMap (data) {
  const fs = await import("node:fs")
  const path = await import("node:path")
  const filePath = path.resolve(GROUP_MAP_FILE)
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8")
}

/**
 * 保存群映射：group_openid → 真实群号
 * @param {string} appid - Bot 的 appid
 * @param {string} groupOpenid - QQBot 群的 openid
 * @param {string} groupUin - 真实 QQ 群号
 */
export async function saveGroupMapping (appid, groupOpenid, groupUin) {
  if (!appid || !groupOpenid || !groupUin) return false
  const raw = await readGroupMap()
  if (!raw[appid]) raw[appid] = {}
  raw[appid][groupOpenid] = String(groupUin)
  await writeGroupMap(raw)
  return true
}

/**
 * 查询群映射：group_openid → 真实群号
 * @returns {string | false}
 */
export async function getGroupMapping (appid, groupOpenid) {
  if (!appid || !groupOpenid) return false
  const raw = await readGroupMap()
  return raw[appid]?.[groupOpenid] || false
}

/**
 * 从 bot 实例获取群映射
 */
export async function getGroupUin (botOrId, groupOpenid) {
  const appid = getAppid(botOrId)
  return getGroupMapping(appid, groupOpenid)
}

/**
 * 反向映射：真实群号 → OpenID
 * 用于 sendGroupMsg 等需要 OpenID 调 SDK 的场景
 * @param {string|object} botOrId
 * @param {string} groupUin - 真实群号
 * @returns {string|false}
 */
export async function translateGroupToOpenid (botOrId, groupUin) {
  if (!groupUin) return false
  const appid = getAppid(botOrId)
  if (!appid) return false
  const raw = await readGroupMap()
  const appMap = raw[appid]
  if (!appMap) return false
  for (const openid of Object.keys(appMap)) {
    if (appMap[openid] === String(groupUin)) return openid
  }
  return false
}
