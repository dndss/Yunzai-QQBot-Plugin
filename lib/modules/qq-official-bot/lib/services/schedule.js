"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScheduleService = void 0;
class ScheduleService {
    constructor(request) {
        this.request = request;
    }
    /**
     * 获取频道日程列表
     */
    async getChannelSchedules(channelId, since) {
        const { data } = await this.request.get(`/channels/${channelId}/schedules`, {
            params: since ? { since } : {}
        });
        return data;
    }
    /**
     * 获取频道日程详情
     */
    async getChannelSchedule(channelId, scheduleId) {
        const { data } = await this.request.get(`/channels/${channelId}/schedules/${scheduleId}`);
        return data;
    }
    /**
     * 创建频道日程
     */
    async createChannelSchedule(channelId, name, description, startTimestamp, endTimestamp, jumpChannelId, remindType = 0) {
        const { data } = await this.request.post(`/channels/${channelId}/schedules`, {
            schedule: {
                name,
                description,
                start_timestamp: `${startTimestamp}`,
                end_timestamp: `${endTimestamp}`,
                jump_channel_id: jumpChannelId,
                remind_type: `${remindType}`
            }
        });
        return data;
    }
    /**
     * 修改频道日程
     */
    async updateChannelSchedule(channelId, scheduleId, name, description, startTimestamp, endTimestamp, jumpChannelId, remindType = 0) {
        const { data } = await this.request.patch(`/channels/${channelId}/schedules/${scheduleId}`, {
            schedule: {
                name,
                description,
                start_timestamp: `${startTimestamp}`,
                end_timestamp: `${endTimestamp}`,
                jump_channel_id: jumpChannelId,
                remind_type: `${remindType}`
            }
        });
        return data;
    }
    /**
     * 删除日程
     */
    async deleteChannelSchedule(channelId, scheduleId) {
        const { data } = await this.request.delete(`/channels/${channelId}/schedules/${scheduleId}`);
        return data;
    }
}
exports.ScheduleService = ScheduleService;
