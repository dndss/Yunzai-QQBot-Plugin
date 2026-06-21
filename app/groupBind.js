/**
 * #群绑定 命令处理 — 独立于 #QQ绑定
 *
 *   #群绑定          → 显示帮助
 *   #群绑定<群号>    → 校验 isMaster → true 绑定 / false 不响应
 *
 * 仅监听群消息（message.group.normal），因为只在群内有意义
 *
 * isMaster 判断：与 Yunzai loader.js 第 398 行逻辑一致
 *   cfg.master[data.self_id]?.includes(String(data.user_id))
 * 其中 data.user_id 经 applyUinMapping 已是真实 QQ 号（需先 #QQ绑定）
 */

import { getAppid } from "../lib/uinMap.js"
import { saveGroupMapping, getGroupMapping } from "../lib/groupMap.js"
import cfg from "../../../lib/config/config.js"

async function handleGroupBindMessage (data) {
  // 仅处理 QQBot 适配器
  const targetIds = ['QQBot']
  if (!targetIds.includes(data.bot?.adapter?.id)) return

  // 仅处理群消息
  if (data.message_type !== "group") return

  try {
    // isMaster：参照 Yunzai loader.js (与 this.e.isMaster 等效)
    const isMaster = !!(data.user_id && cfg.master[data.self_id]?.includes(String(data.user_id)))

    const text = String(data.raw_message || "").trim()

    // --- #群绑定<群号>：绑定当前群 ---
    const match = text.match(/^(?:#群绑定)\s*(\d{5,15})\s*$/)
    if (match) {
      // 仅 master 可操作，非 master 静默不响应
      if (!isMaster) {
        Bot.makeLog?.("debug", [`[群绑定] 非master忽略: user_id=${data.user_id} self_id=${data.self_id}`], data.self_id)
        return
      }

      const groupUin = match[1]
      const appid = getAppid(data.bot || data.self_id)
      const groupOpenid = String(data._raw_group_id || data.group_id || "")

      Bot.makeLog?.("info", [`[群绑定] 开始绑定: appid=${appid} groupOpenid=${groupOpenid} → ${groupUin}`], data.self_id)

      if (!groupOpenid) {
        await data.reply("获取当前群信息失败")
        return
      }

      try {
        const ok = await saveGroupMapping(appid, groupOpenid, groupUin)
        if (!ok) {
          await data.reply("群绑定失败：群号格式不正确或当前群信息无效。")
          return
        }
        Bot.makeLog?.("info", [`[群绑定] 绑定成功: ${groupUin}`], data.self_id)
        await data.reply(`群绑定成功：${groupUin}`)
      } catch (err) {
        Bot.makeLog?.("error", ["QQBot 群绑定失败", appid, groupOpenid, groupUin, err], data.self_id)
        await data.reply("群绑定失败，请稍后重试。")
      }
      return
    }

    // --- #群绑定：显示帮助 ---
    if (text === "#群绑定") {
      // 仅 master 可查看
      if (!isMaster) {
        Bot.makeLog?.("debug", [`[群绑定] 非master查看忽略: user_id=${data.user_id} self_id=${data.self_id}`], data.self_id)
        return
      }

      const appid = getAppid(data.bot || data.self_id)
      const groupOpenid = String(data._raw_group_id || data.group_id || "")
      const currentMapping = await getGroupMapping(appid, groupOpenid)

      const msg = currentMapping
        ? [`当前群已绑定：${currentMapping}\n如需更换请发送 #群绑定+新群号`]
        : ["请发送 #群绑定+群号 进行群绑定\n例如：#群绑定123456789"]

      await data.reply([
        ...msg,
        segment.button([
          { text: "输入群号绑定", input: "#群绑定 ", send: false },
        ]),
      ])
    }
  } catch (err) {
    Bot.makeLog?.("error", ["[群绑定] 处理消息异常", err], data.self_id)
  }
}

// 仅监听群消息
Bot.on("message.group.normal", handleGroupBindMessage)
Bot.makeLog?.("info", ["[群绑定] 模块加载完成，已注册 message.group.normal 监听"])
