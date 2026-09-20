"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageService = void 0;
const message_1 = require("../message");
const REPLY_SEQUENCE_TTL = 5 * 60 * 1000;
const REPLY_SEQUENCE_DUPLICATED = 40054005;
const REPLY_MESSAGE_EXPIRED = 40034005;
const MAX_REPLY_SEQUENCE = 5;
class MessageService {
    constructor(request, appid) {
        this.request = request;
        this.appid = appid;
        this.replySequences = new Map();
    }
    nextReplySequence(messageId) {
        const now = Date.now();
        const current = this.replySequences.get(messageId);
        if (current && current.expiresAt > now) {
            current.sequence += 1;
            return current.sequence;
        }
        const entry = {
            sequence: 1,
            expiresAt: now + REPLY_SEQUENCE_TTL,
        };
        this.replySequences.set(messageId, entry);
        const timer = setTimeout(() => {
            if (this.replySequences.get(messageId) === entry)
                this.replySequences.delete(messageId);
        }, REPLY_SEQUENCE_TTL);
        timer.unref?.();
        return entry.sequence;
    }
    releaseReplySequence(messageId, sequence) {
        const current = this.replySequences.get(messageId);
        if (!current || current.sequence !== sequence)
            return;
        if (sequence === 1)
            this.replySequences.delete(messageId);
        else
            current.sequence -= 1;
    }
    advanceReplySequence(messageId, sequence) {
        const current = this.replySequences.get(messageId);
        if (current && current.sequence < sequence)
            current.sequence = sequence;
    }
    getOpenApiErrorCode(error) {
        const value = Number(error?.err_code ??
            error?.code ??
            error?.response?.data?.err_code ??
            error?.response?.data?.code);
        return Number.isSafeInteger(value) ? value : undefined;
    }
    /**
     * 获取子频道消息
     */
    async getGuildMessage(channelId, messageId) {
        const { data: result } = await this.request.get(`/channels/${channelId}/messages/${messageId}`);
        return result;
    }
    /**
     * 发送频道消息
     */
    async sendGuildMessage(channelId, message, source, options = {}) {
        return await this.sendMessage(`/channels/${channelId}`, message, source, options);
    }
    /**
     * 撤回频道消息
     */
    async recallGuildMessage(channelId, messageId, hideWarning) {
        const result = await this.request.delete(`/channels/${channelId}/messages/${messageId}?hidetip=${!!hideWarning}`);
        return result.status === 200;
    }
    /**
     * 创建频道私信会话
     */
    async createDirectSession(guildId, userId) {
        const { data: result } = await this.request.post(`/users/@me/dms`, {
            recipient_id: userId,
            source_guild_id: guildId
        });
        return result;
    }
    /**
     * 发送频道私信
     */
    async sendDirectMessage(guildId, message, source, options = {}) {
        return await this.sendMessage(`/dms/${guildId}`, message, source, options);
    }
    /**
     * 获取频道私信消息
     */
    async getDirectMessage(guildId, messageId) {
        const { data: result } = await this.request.get(`/dms/${guildId}/messages/${messageId}`);
        return result;
    }
    /**
     * 撤回频道私信
     */
    async recallDirectMessage(guildId, messageId, hidetip) {
        const result = await this.request.delete(`/dms/${guildId}/messages/${messageId}?hidetip=${!!hidetip}`);
        return result.status === 200;
    }
    /**
     * 发送私聊消息
     */
    async sendPrivateMessage(userId, message, source, options = {}) {
        return await this.sendMessage(`/v2/users/${userId}`, message, source, options);
    }
    /**
     * 撤回私聊消息
     */
    async recallPrivateMessage(userId, messageId) {
        const result = await this.request.delete(`/v2/users/${userId}/messages/${messageId}`);
        return result.status === 200;
    }
    /**
     * 发送群消息
     */
    async sendGroupMessage(groupId, message, source, options = {}) {
        return await this.sendMessage(`/v2/groups/${groupId}`, message, source, options);
    }
    /**
     * 撤回群消息
     */
    async recallGroupMessage(groupId, messageId) {
        const result = await this.request.delete(`/v2/groups/${groupId}/messages/${messageId}`);
        return result.status === 200;
    }
    /**
     * 核心发送消息方法
     */
    async sendMessage(endpointPath, message, source, options = {}) {
        // 构建消息
        const messageBuilder = new message_1.MessageBuilder(this.appid, !endpointPath.startsWith('/v2'), source, options.quote);
        const buildResult = await messageBuilder.build(message);
        const replyMessageId = buildResult.messagePayload.msg_id;
        let replySequence;
        if (replyMessageId) {
            replySequence = this.nextReplySequence(replyMessageId);
            buildResult.messagePayload.msg_seq = replySequence;
        }
        try {
            // 处理文件发送
            if (buildResult.isFile) {
                const uploaded = await this.uploadFile(endpointPath, buildResult);
                buildResult.messagePayload.media = { file_info: uploaded.file_info };
            }
            try {
                // 发送普通消息
                return await this.sendRegularMessage(endpointPath, buildResult, options);
            }
            catch (initialError) {
                let error = initialError;
                // msg_seq 被腾讯侧占用时，在被动回复允许的 1～5 范围内递增重试。
                while (replyMessageId &&
                    replySequence !== undefined &&
                    replySequence < MAX_REPLY_SEQUENCE &&
                    this.getOpenApiErrorCode(error) === REPLY_SEQUENCE_DUPLICATED) {
                    replySequence += 1;
                    this.advanceReplySequence(replyMessageId, replySequence);
                    buildResult.messagePayload.msg_seq = replySequence;
                    try {
                        return await this.sendRegularMessage(endpointPath, buildResult, options);
                    }
                    catch (retryError) {
                        error = retryError;
                    }
                }
                const isQuotedReply = Boolean(buildResult.messagePayload.message_reference);
                const isExpiredReply = this.getOpenApiErrorCode(error) === REPLY_MESSAGE_EXPIRED;
                // 引用回复被动发送失败，或 msg_id 已过期时，移除被动回复凭据后转主动发送。
                // message_reference 会被保留，因此引用回复仍显示原引用。
                if (replyMessageId && (isQuotedReply || isExpiredReply)) {
                    if (replySequence !== undefined)
                        this.releaseReplySequence(replyMessageId, replySequence);
                    replySequence = undefined;
                    delete buildResult.messagePayload.msg_id;
                    delete buildResult.messagePayload.msg_seq;
                    return await this.sendRegularMessage(endpointPath, buildResult, options);
                }
                throw error;
            }
        }
        catch (error) {
            if (replyMessageId && replySequence !== undefined)
                this.releaseReplySequence(replyMessageId, replySequence);
            throw error;
        }
    }
    /**
     * 上传文件
     */
    async uploadFile(endpointPath, buildResult) {
        const { local_path, ...payload } = buildResult.filePayload;
        if (local_path) {
            if (!payload.file_type)
                throw new Error('Missing file_type for chunked upload');
            const uploader = new message_1.ChunkedUploader(this.request);
            return uploader.upload(endpointPath, local_path, payload.file_type, {
                fileName: payload.file_name
            });
        }
        const { data: result } = await this.request.post(endpointPath + '/files', {
            ...payload,
            srv_send_msg: false
        });
        return result;
    }
    /**
     * 发送普通消息
     */
    async sendRegularMessage(endpointPath, buildResult, options) {
        const { data: result } = await this.request.post(endpointPath + '/messages', buildResult.messagePayload, {
            headers: {
                'Content-Type': buildResult.contentType
            },
            timeout: options.timeout || 10000
        });
        if (this.isAuditResult(result)) {
            // 如果是审核结果，返回审核信息
            return {
                id: result.message_audit.audit_id,
                timestamp: Date.now() / 1000,
                audit_status: 'pending',
                reason: '',
                brief: buildResult.brief,
            };
        }
        return {
            id: result.id,
            timestamp: Date.now() / 1000,
            brief: buildResult.brief,
            ...(result.ext_info && { ext_info: result.ext_info }),
        };
    }
    /**
     * 检查是否为审核结果
     */
    isAuditResult(result) {
        return result && typeof result === 'object' && 'message_audit' in result;
    }
    /**
     * 批量发送消息
     */
    async sendBatch(endpointPath, messages, options = {}) {
        const results = [];
        for (const message of messages) {
            const result = await this.sendMessage(endpointPath, message, undefined, options);
            results.push(result);
            // 添加发送间隔以避免频率限制
            await this.delay(100);
        }
        return results;
    }
    /**
     * 工具方法：延迟
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.MessageService = MessageService;
