"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioService = void 0;
class AudioService {
    constructor(request) {
        this.request = request;
    }
    /**
     * 音频控制
     */
    async controlChannelAudio(channelId, audioControl) {
        const result = await this.request.post(`/channels/${channelId}/audio`, audioControl);
        return result.status === 200;
    }
    /**
     * 上麦
     */
    async setOnlineMic(channelId) {
        const result = await this.request.put(`/channels/${channelId}/mic`);
        return result.status === 200;
    }
    /**
     * 下麦
     */
    async setOfflineMic(channelId) {
        const result = await this.request.delete(`/channels/${channelId}/mic`);
        return result.status === 204;
    }
}
exports.AudioService = AudioService;
