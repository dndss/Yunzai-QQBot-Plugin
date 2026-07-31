"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuildService = void 0;
class GuildService {
    constructor(request) {
        this.request = request;
    }
    /**
     * 获取频道列表
     */
    async getList() {
        const result = await this._getGuildList();
        return result;
    }
    /**
     * 获取频道信息
     */
    async getInfo(guildId) {
        const { data: { id: _, name: guild_name, joined_at, ...guild } } = await this.request.get(`/guilds/${guildId}`);
        const result = {
            guild_id: guildId,
            guild_name,
            join_time: new Date(joined_at).getTime() / 1000,
            ...guild
        };
        return result;
    }
    /**
     * 频道禁言
     */
    async mute(guildId, seconds, endTime) {
        const result = await this.request.put(`/guilds/${guildId}/mute`, {
            mute_seconds: `${seconds}`,
            mute_end_timestamp: `${endTime || 0}`
        });
        return result.status === 204;
    }
    /**
     * 取消频道禁言
     */
    async unmute(guildId) {
        return this.mute(guildId, 0, 0);
    }
    /**
     * 获取频道角色列表
     */
    async getRoles(guildId) {
        const { data: { roles = [] } = {} } = await this.request.get(`/guilds/${guildId}/roles`);
        return roles;
    }
    /**
     * 创建频道角色
     */
    async createRole(guildId, role) {
        const { data: { role: result } } = await this.request.post(`/guilds/${guildId}/roles`, role);
        return result;
    }
    /**
     * 更新频道角色
     */
    async updateRole(guildId, roleId, updateInfo) {
        const { data: { role: result } } = await this.request.patch(`/guilds/${guildId}/roles/${roleId}`, updateInfo);
        return result;
    }
    /**
     * 删除频道角色
     */
    async deleteRole(roleId) {
        const result = await this.request.delete(`/guilds/{guild_id}/roles/${roleId}`);
        return result.status === 204;
    }
    /**
     * 获取频道可访问API类别
     */
    async getAccessApis(guildId) {
        const { data: { apis = [] } } = await this.request.get(`/guilds/${guildId}/api_permission`);
        return apis;
    }
    /**
     * 申请频道API权限
     */
    async applyAccess(guildId, channelId, apiInfo, desc) {
        const { data: result } = await this.request.post(`/guilds/${guildId}/api_permission/demand`, {
            channel_id: channelId,
            api_identify: apiInfo,
            desc,
        });
        return result;
    }
    /**
     * 私有方法：获取频道列表的实现
     */
    async _getGuildList(after) {
        const res = await this.request.get('/users/@me/guilds', {
            params: { after }
        }).catch(() => ({ data: [] })); // 私域不支持获取频道列表，做个兼容
        if (!res.data?.length)
            return [];
        const result = (res.data || []).map(g => {
            const { id: guild_id, name: guild_name, joined_at, ...guild } = g;
            return {
                guild_id,
                guild_name,
                join_time: new Date(joined_at).getTime() / 1000,
                ...guild
            };
        });
        const last = result[result.length - 1];
        if (result.length === 100) { // 如果返回了100条，可能还有更多
            const nextResults = await this._getGuildList(last.guild_id);
            return [...result, ...nextResults];
        }
        return result;
    }
}
exports.GuildService = GuildService;
