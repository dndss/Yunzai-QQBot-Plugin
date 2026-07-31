"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThreadService = void 0;
class ThreadService {
    constructor(request) {
        this.request = request;
    }
    /**
     * 获取频道帖子列表
     */
    async getChannelThreads(channelId) {
        const { data } = await this.request.get(`/channels/${channelId}/threads`);
        return data;
    }
    /**
     * 获取频道帖子详情
     */
    async getChannelThreadInfo(channelId, threadId) {
        const { data } = await this.request.get(`/channels/${channelId}/threads/${threadId}`);
        return data;
    }
    /**
     * 创建频道帖子
     */
    async publishThread(channelId, title, content, format = 3) {
        const { data } = await this.request.post(`/channels/${channelId}/threads`, {
            title,
            content,
            format
        });
        return data;
    }
    /**
     * 删除频道帖子
     */
    async deleteThread(channelId, threadId) {
        const result = await this.request.delete(`/channels/${channelId}/threads/${threadId}`);
        return result.status === 204;
    }
}
exports.ThreadService = ThreadService;
