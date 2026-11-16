"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
class UserService {
    constructor(request) {
        this.request = request;
    }
    /**
     * 获取用户基本信息，需要用户与机器人存在好友关系
     */
    async getInfo(userOpenid) {
        if (typeof userOpenid !== 'string' || !userOpenid.trim()) {
            throw new TypeError('userOpenid 必须是非空字符串');
        }
        const { data: result } = await this.request.get(`/v2/users/${userOpenid}/info`);
        return result;
    }
}
exports.UserService = UserService;
