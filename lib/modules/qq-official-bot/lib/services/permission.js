"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionService = void 0;
class PermissionService {
    constructor(request) {
        this.request = request;
    }
    /**
     * 获取频道角色权限信息
     */
    async getChannelRolePermission(channelId, roleId) {
        const { data: result } = await this.request.get(`/channels/${channelId}/roles/${roleId}/permissions`);
        return result;
    }
    /**
     * 更新频道角色权限
     */
    async updateChannelRolePermission(channelId, roleId, permission) {
        const result = await this.request.put(`/channels/${channelId}/roles/${roleId}/permissions`, permission);
        return result.status === 204;
    }
    /**
     * 获取频道用户权限
     */
    async getChannelMemberPermission(channelId, memberId) {
        const { data: result } = await this.request.get(`/channels/${channelId}/members/${memberId}/permissions`);
        return result;
    }
    /**
     * 更新频道用户权限
     */
    async updateChannelMemberPermission(channelId, memberId, permission) {
        const result = await this.request.put(`/channels/${channelId}/members/${memberId}/permissions`, permission);
        return result.status === 204;
    }
    /**
     * 设置频道公告
     */
    async setChannelAnnounce(guildId, channelId, messageId) {
        const { data: result } = await this.request.post(`/guilds/${guildId}/announces`, {
            channel_id: channelId,
            message_id: messageId
        });
        return result;
    }
}
exports.PermissionService = PermissionService;
