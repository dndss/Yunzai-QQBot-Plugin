"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChannelService = void 0;
class ChannelService {
    constructor(request) {
        this.request = request;
    }
    /**
     * 获取子频道列表
     */
    async getList(guildId) {
        const { data: result = [] } = await this.request.get(`/guilds/${guildId}/channels`);
        return result.map(({ id: channel_id, name: channel_name, ...channel }) => ({
            channel_id,
            channel_name,
            ...channel
        }));
    }
    /**
     * 获取子频道信息
     */
    async getInfo(channelId) {
        const { data: { id: _, name: channel_name, ...channel } } = await this.request.get(`/channels/${channelId}`);
        return {
            channel_id: channelId,
            channel_name,
            ...channel
        };
    }
    /**
     * 创建子频道
     */
    async create(guildId, channelInfo) {
        const { data: result } = await this.request.post(`/guilds/${guildId}/channels`, channelInfo);
        return result;
    }
    /**
     * 修改子频道
     */
    async update(channelId, updateInfo) {
        const { data: result } = await this.request.patch(`/channels/${channelId}`, updateInfo);
        return result;
    }
    /**
     * 删除子频道
     */
    async delete(channelId) {
        const result = await this.request.delete(`/channels/${channelId}`);
        return result.status === 200;
    }
    /**
     * 获取频道置顶消息id列表
     */
    async getPins(channelId) {
        const { data: { message_ids = [] } = {} } = await this.request.get(`/channels/${channelId}/pins`);
        return message_ids;
    }
    /**
     * 置顶频道消息
     */
    async pinMessage(channelId, messageId) {
        const { data: result } = await this.request.post(`/channels/${channelId}/pins/${messageId}`);
        return result;
    }
    /**
     * 取消置顶频道消息
     */
    async unpinMessage(channelId, messageId) {
        const result = await this.request.delete(`/channels/${channelId}/pins/${messageId}`);
        return result.status === 204;
    }
}
exports.ChannelService = ChannelService;
