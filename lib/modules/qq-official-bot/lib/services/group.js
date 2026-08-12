"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupService = void 0;
class GroupService {
    constructor(request) {
        this.request = request;
    }
    /**
     * 获取群基本信息
     */
    async getInfo(groupOpenid) {
        const { data: result } = await this.request.get(`/v2/groups/${groupOpenid}/info`);
        return result;
    }
}
exports.GroupService = GroupService;
