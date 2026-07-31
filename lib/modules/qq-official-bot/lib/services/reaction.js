"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReactionService = void 0;
class ReactionService {
    constructor(request) {
        this.request = request;
    }
    /**
     * 对频道消息进行表态
     */
    async addGuildMessageReaction(channelId, messageId, type, id) {
        const result = await this.request.put(`/channels/${channelId}/messages/${messageId}/reactions/${type}/${id}`);
        return result.status === 204;
    }
    /**
     * 删除频道消息表态
     */
    async deleteGuildMessageReaction(channelId, messageId, type, id) {
        const result = await this.request.delete(`/channels/${channelId}/messages/${messageId}/reactions/${type}/${id}`);
        return result.status === 204;
    }
    /**
     * 获取表态用户列表
     */
    async getGuildMessageReactionMembers(channelId, messageId, type, id) {
        return await this._getGuildMessageReactionMembers(channelId, messageId, type, id);
    }
    /**
     * 私有方法：获取表态用户列表的实现
     */
    async _getGuildMessageReactionMembers(channelId, messageId, type, id, cookies) {
        const formatUser = (users) => {
            return users.map(({ id, username, avatar, bot, public_flag }) => ({
                id,
                username,
                avatar,
                bot,
                public_flag
            }));
        };
        const { data: { users, cookie, is_end } } = await this.request.get(`/channels/${channelId}/messages/${messageId}/reactions/${type}/${id}`, {
            params: {
                cookie: cookies
            }
        });
        if (is_end)
            return formatUser(users);
        return [...formatUser(users), ...await this._getGuildMessageReactionMembers(channelId, messageId, type, id, cookie)];
    }
}
exports.ReactionService = ReactionService;
