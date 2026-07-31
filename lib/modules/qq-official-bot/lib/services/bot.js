"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotService = void 0;
class BotService {
    constructor(request) {
        this.request = request;
    }
    /**
     * 获取机器人信息
     */
    async getSelfInfo() {
        const { data: result } = await this.request.get('/users/@me');
        return result;
    }
    /**
     * 回应操作
     */
    async replyAction(actionId, code = 0) {
        const result = await this.request.put(`/interactions/${actionId}`, { code });
        return result.status === 200;
    }
}
exports.BotService = BotService;
