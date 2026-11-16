"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupService = void 0;
class GroupService {
    constructor(request) {
        this.request = request;
    }
    /**
     * 批量移除群成员，单次操作 1 至 20 个成员，不自动拆批或重试
     */
    async batchRemoveMembers(groupOpenid, memberOpenids) {
        if (typeof groupOpenid !== 'string' || !groupOpenid.trim()) {
            throw new TypeError('groupOpenid 必须是非空字符串');
        }
        if (!Array.isArray(memberOpenids) || memberOpenids.length < 1 || memberOpenids.length > 20) {
            throw new RangeError('memberOpenids 必须是包含 1 至 20 个成员 OpenID 的数组');
        }
        for (const openid of memberOpenids) {
            if (typeof openid !== 'string' || !openid.trim()) {
                throw new TypeError('成员 OpenID 必须是非空字符串');
            }
        }
        const { data: result } = await this.request.post(`/v2/groups/${groupOpenid}/batch_remove_members`, { member_openids: memberOpenids });
        return result;
    }
    /**
     * 获取群基本信息
     */
    async getInfo(groupOpenid) {
        const { data: result } = await this.request.get(`/v2/groups/${groupOpenid}/info`);
        return result;
    }
    /**
     * 获取机器人群内状态
     */
    async getBotState(groupOpenid) {
        const { data: result } = await this.request.get(`/v2/groups/${groupOpenid}/bot_state`);
        return result;
    }
    /**
     * 查询群禁言状态
     */
    async getRestrictChatSetting(groupOpenid) {
        const { data: result } = await this.request.get(`/v2/groups/${groupOpenid}/restrict_chat_setting`);
        return result;
    }
    /**
     * 设置群成员禁言，单次最多操作 10 个成员
     */
    async setMemberMuteState(groupOpenid, members) {
        const result = await this.request.post(`/v2/groups/${groupOpenid}/restrict_chat_setting`, { members });
        return result.status >= 200 && result.status < 300;
    }
}
exports.GroupService = GroupService;
