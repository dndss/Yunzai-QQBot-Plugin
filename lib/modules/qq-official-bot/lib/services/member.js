"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemberService = void 0;
class MemberService {
    constructor(request) {
        this.request = request;
    }
    /**
     * 获取频道成员列表
     */
    async getGuildMemberList(guildId) {
        return await this._getGuildMemberList(guildId);
    }
    /**
     * 获取频道成员信息
     */
    async getGuildMemberInfo(guildId, memberId) {
        const { data: { user: { id: member_id, ...member }, roles, joined_at, nick } } = await this.request.get(`/guilds/${guildId}/members/${memberId}`);
        return {
            member_id,
            card: nick,
            roles,
            ...member,
            join_time: new Date(joined_at).getTime() / 1000,
        };
    }
    /**
     * 批量禁言频道成员
     */
    async muteMembers(guildId, memberIds, seconds, endTime) {
        const result = await this.request.put(`/guilds/${guildId}/mute`, {
            mute_seconds: `${seconds}`,
            mute_end_timestamp: `${endTime}`,
            user_ids: memberIds
        });
        return result.status === 200;
    }
    /**
     * 批量取消频道成员禁言
     */
    async unmuteMembers(guildId, memberIds) {
        return await this.muteMembers(guildId, memberIds, 0, 0);
    }
    /**
     * 添加频道成员角色
     */
    async addMemberRole(guildId, channelId, memberId, roleId) {
        const result = await this.request.put(`/guilds/${guildId}/members/${memberId}/roles/${roleId}`, { id: channelId });
        return result.status === 204;
    }
    /**
     * 移除频道成员角色
     */
    async removeMemberRole(guildId, channelId, memberId, roleId) {
        const result = await this.request.delete(`/guilds/${guildId}/members/${memberId}/roles/${roleId}`, { data: { id: channelId } });
        return result.status === 204;
    }
    /**
     * 踢出频道成员
     */
    async kickMember(guildId, memberId, clean = 0, blacklist) {
        const result = await this.request.delete(`/guilds/${guildId}/members/${memberId}`, {
            data: {
                add_blacklist: blacklist,
                delete_message_days: clean
            }
        });
        return result.status === 204;
    }
    /**
     * 私有方法：获取频道成员列表的实现
     */
    async _getGuildMemberList(guildId, after) {
        const res = await this.request.get(`/guilds/${guildId}/members`, {
            params: {
                after,
                limit: 100
            }
        }).catch(() => ({ data: [] })); // 公域没有权限，做个兼容
        if (!res.data?.length)
            return [];
        const result = (res.data || []).map(m => {
            const { user: { id: member_id, ...member }, roles, joined_at, nick } = m;
            return {
                member_id,
                card: nick,
                roles,
                ...member,
                join_time: new Date(joined_at).getTime() / 1000,
            };
        });
        const last = result[result.length - 1];
        if (result.length < 100)
            return result;
        return [...result, ...await this._getGuildMemberList(guildId, last.member_id)];
    }
}
exports.MemberService = MemberService;
