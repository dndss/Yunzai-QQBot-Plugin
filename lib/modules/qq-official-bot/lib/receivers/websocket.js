"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketReceiver = exports.WebSocketReceiverConfig = void 0;
exports.createWebsocketReceiver = createWebsocketReceiver;
const ws_1 = require("ws");
const base_1 = require("./base");
const object_1 = require("../utils/object");
const constants_1 = require("../constants");
/**
 * WebSocket接收器配置
 */
class WebSocketReceiverConfig extends base_1.BaseReceiverConfig {
    constructor(options = {}) {
        super(base_1.ReceiverMode.WEBSOCKET);
        this.heartbeatInterval = options.heartbeatInterval ?? 45000;
        this.maxRetries = options.maxRetries ?? 10;
        this.reconnectDelay = options.reconnectDelay ?? 1000;
    }
    validate() {
        return this.heartbeatInterval > 0 && this.maxRetries >= 0 && this.reconnectDelay >= 0;
    }
    toJson() {
        return {
            mode: this.mode,
            heartbeatInterval: this.heartbeatInterval,
            maxRetries: this.maxRetries,
            reconnectDelay: this.reconnectDelay
        };
    }
}
exports.WebSocketReceiverConfig = WebSocketReceiverConfig;
/**
 * WebSocket接收器实现
 */
class WebSocketReceiver extends base_1.BaseReceiver {
    constructor(config = new WebSocketReceiverConfig()) {
        super({});
        this.session = null;
        // 连接状态管理
        this.heartbeatInterval = 45000;
        this.isReconnect = false;
        this.retryCount = 0;
        this.isClosed = true;
        this.lifecycleGeneration = 0;
        this.heartbeatTimer = null;
        this.heartbeatTimeoutTimer = null;
        this.lastHeartbeatAck = 0;
        this.config = config;
        this.setupWebSocketEventHandlers();
    }
    /**
     * 设置WebSocket特定的事件处理器
     */
    setupWebSocketEventHandlers() {
        this.on('start', this.handleStart.bind(this));
        this.on('stop', this.handleStop.bind(this));
        this.on('restart', this.handleRestart.bind(this));
    }
    /**
     * 启动WebSocket连接
     */
    async start(session) {
        this.session = session;
        this.session.userClose = false;
        this._isStarted = true;
        const generation = ++this.lifecycleGeneration;
        await this.connect(generation);
    }
    /**
     * 停止WebSocket连接
     */
    async stop(session) {
        this._isStarted = false;
        this.lifecycleGeneration++;
        this.isReconnect = false;
        this.retryCount = 0;
        this.disconnect();
    }
    /**
     * 处理启动事件
     */
    async handleStart(session) {
        await this.start(session);
    }
    /**
     * 处理停止事件
     */
    async handleStop() {
        await this.stop();
    }
    /**
     * 处理重启事件
     */
    async handleRestart(session) {
        await this.restart(session);
    }
    /**
     * 建立WebSocket连接
     */
    async connect(generation) {
        if (!this.session) {
            throw new Error('Session manager not initialized');
        }
        if (!this.isLifecycleActive(generation))
            return;
        try {
            const url = await this.session.getWsUrl();
            if (!this.isLifecycleActive(generation))
                return;
            const ws = this.handler.ws = new ws_1.WebSocket(url);
            this.setupWebSocketConnection(ws);
        }
        catch (error) {
            this.session.getBot().logger.error(`[WebSocketReceiver] 连接失败: ${error.message}`);
            this.emitError(error);
            throw error;
        }
    }
    /**
     * 设置WebSocket连接的事件处理
     */
    setupWebSocketConnection(ws) {
        if (!this.session)
            return;
        ws.on('open', () => {
            this.session.getBot().logger.debug('[WebSocketReceiver] WebSocket连接已建立');
        });
        ws.on('message', async (data) => {
            await this.handleMessage(data);
        });
        ws.on('error', (error) => {
            this.handleWebSocketError(error);
        });
        ws.on('close', (code, reason) => {
            this.handleWebSocketClose(code, reason);
        });
    }
    /**
     * 处理WebSocket消息
     */
    async handleMessage(data) {
        if (!this.session)
            return;
        try {
            this.session.getBot().logger.debug(`[WebSocketReceiver] 收到消息: ${data}`);
            const packet = (0, object_1.toObject)(data);
            switch (packet.op) {
                case constants_1.OpCode.HELLO:
                    await this.handleHello(packet);
                    break;
                case constants_1.OpCode.DISPATCH:
                    this.handleDispatch(packet);
                    break;
                case constants_1.OpCode.HEARTBEAT_ACK:
                    this.handleHeartbeatAck(packet);
                    break;
                case constants_1.OpCode.RECONNECT:
                    this.handleReconnectRequest();
                    break;
                case constants_1.OpCode.INVALID_SESSION:
                    this.handleInvalidSession();
                    break;
                default:
                    this.session.getBot().logger.debug(`[WebSocketReceiver] 未处理的操作码: ${packet.op}`);
            }
        }
        catch (error) {
            this.session.getBot().logger.error(`[WebSocketReceiver] 处理消息失败: ${error.message}`);
            this.emitError(error);
        }
    }
    /**
     * 处理HELLO消息
     */
    async handleHello(packet) {
        if (!this.session)
            return;
        this.session.getBot().logger.debug('[WebSocketReceiver] 收到HELLO消息，连接到网关成功');
        this.heartbeatInterval = packet.d.heartbeat_interval || this.config.heartbeatInterval;
        this.session.getBot().logger.debug(`[WebSocketReceiver] 心跳间隔设置为: ${this.heartbeatInterval}ms`);
        if (this.isReconnect) {
            await this.resumeConnection();
        }
        else {
            await this.authenticate();
        }
    }
    /**
     * 处理DISPATCH事件
     */
    handleDispatch(packet) {
        if (!this.session)
            return;
        this.dispatchEvent(packet.t, packet);
    }
    /**
     * 处理心跳ACK
     */
    handleHeartbeatAck(packet) {
        if (!this.session)
            return;
        if (this.heartbeatTimeoutTimer) {
            clearTimeout(this.heartbeatTimeoutTimer);
        }
        this.lastHeartbeatAck = Date.now();
        this.session.getBot().logger.debug(`[WebSocketReceiver] 收到心跳ACK`);
    }
    /**
     * 处理重连请求
     */
    handleReconnectRequest() {
        if (!this.session)
            return;
        this.session.getBot().logger.info(`[WebSocketReceiver] 服务端要求重连`);
        this.handler.ws?.close(4009);
    }
    /**
     * 处理无效会话
     */
    handleInvalidSession() {
        if (!this.session)
            return;
        this.session.getBot().logger.error(`[WebSocketReceiver] 连接失败，无效的会话`);
        this.session.updateSessionRecord({ sessionID: "", seq: 0 });
        this.isReconnect = false;
        this.handler.ws?.close(4000, "Invalid Session");
    }
    /**
     * 事件分发
     */
    dispatchEvent(event, packet) {
        if (!this.session)
            return;
        switch (event) {
            case constants_1.SessionEvents.READY:
                this.handleReadyEvent(packet);
                break;
            case constants_1.SessionEvents.RESUMED:
                this.handleResumedEvent();
                break;
            default:
                // 更新心跳序列号
                if (packet.s) {
                    this.session.updateSessionRecord({ seq: packet.s });
                }
                this.emitPacket(packet);
        }
    }
    /**
     * 处理READY事件
     */
    handleReadyEvent(packet) {
        if (!this.session)
            return;
        const { user = {}, session_id } = packet.d;
        this.session.getBot().self_id = user.id;
        this.session.getBot().nickname = user.username;
        this.session.getBot().status = user.status || 0;
        this.session.updateSessionRecord({ sessionID: session_id });
        this.isClosed = false;
        this.retryCount = 0;
        this.startHeartbeat();
        this.emitReady();
        this.session.getBot().logger.info(`[WebSocketReceiver] 欢迎 ${user.username}`);
    }
    /**
     * 处理RESUMED事件
     */
    handleResumedEvent() {
        if (!this.session)
            return;
        this.retryCount = 0;
        this.isReconnect = false;
        this.isClosed = false;
        this.startHeartbeat();
        this.session.getBot().logger.info(`[WebSocketReceiver] 重连成功`);
    }
    /**
     * 恢复连接
     */
    async resumeConnection() {
        if (!this.session)
            return;
        this.session.getBot().logger.debug('[WebSocketReceiver] 正在恢复连接...');
        await this.sendMessage({
            op: constants_1.OpCode.RESUME,
            d: {
                token: `QQBot ${this.session.access_token}`,
                session_id: this.session.sessionRecord.sessionID,
                seq: this.session.sessionRecord.seq || 1
            }
        });
    }
    /**
     * 认证
     */
    async authenticate() {
        if (!this.session)
            return;
        this.session.getBot().logger.debug('[WebSocketReceiver] 正在鉴权...');
        await this.sendMessage({
            op: constants_1.OpCode.IDENTIFY,
            d: {
                token: `QQBot ${this.session.access_token}`,
                intents: this.session.getValidIntends(),
                shard: [0, 1]
            }
        });
    }
    /**
     * 开始心跳
     */
    startHeartbeat() {
        this.sendHeartbeat();
    }
    /**
     * 发送心跳
     */
    sendHeartbeat() {
        if (!this.session || this.isClosed)
            return;
        if (this.heartbeatTimer) {
            clearTimeout(this.heartbeatTimer);
        }
        if (this.heartbeatTimeoutTimer) {
            clearTimeout(this.heartbeatTimeoutTimer);
        }
        this.session.getBot().logger.debug(`[WebSocketReceiver] 发送心跳`);
        this.sendMessage({
            op: constants_1.OpCode.HEARTBEAT,
            d: this.session.sessionRecord?.seq || null
        });
        // 设置心跳超时检测
        this.heartbeatTimeoutTimer = setTimeout(() => {
            if (this.session) {
                this.session.getBot().logger.error('[WebSocketReceiver] 心跳超时，连接可能已断开');
                this.handler.ws?.close(4000, 'Heartbeat timeout');
            }
        }, 5000);
        if (!this.isClosed) {
            this.heartbeatTimer = setTimeout(() => this.sendHeartbeat(), this.heartbeatInterval);
        }
    }
    /**
     * 发送消息到WebSocket
     */
    async sendMessage(data) {
        if (!this.handler.ws || this.handler.ws.readyState !== ws_1.WebSocket.OPEN) {
            throw new Error('WebSocket connection not available');
        }
        if (this.session) {
            this.session.getBot().logger.debug('[WebSocketReceiver] 发送消息', data);
        }
        const message = typeof data === "object" ? JSON.stringify(data) : data;
        this.handler.ws.send(message);
    }
    /**
     * 处理WebSocket错误
     */
    handleWebSocketError(error) {
        if (!this.session)
            return;
        this.session.getBot().logger.error("[WebSocketReceiver] WebSocket连接错误", {
            error: error.message,
            stack: error.stack,
            retryCount: this.retryCount
        });
        this.clearTimers();
        this.emitError(error);
        // 根据错误类型决定是否重连
        if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
            this.session.getBot().logger.error('[WebSocketReceiver] 网络连接错误，可能是网络问题或服务器不可达');
        }
        this.handler.ws?.close(4000, error.message);
    }
    /**
     * 处理WebSocket关闭
     */
    handleWebSocketClose(code, reason) {
        if (!this.session)
            return;
        this.isClosed = true;
        this.clearTimers();
        let hasInternalReconnect = false;
        if (this.session.userClose) {
            this.session.getBot().logger.info('[WebSocketReceiver] 用户主动关闭连接');
            this.emitClose(code, reason.toString());
            return;
        }
        // 处理机器人下架或封禁的情况
        if ([4914, 4915].includes(code)) {
            this.session.getBot().logger.error(`[WebSocketReceiver] 机器人状态异常，代码: ${code}`);
            this.emitClose(code, reason.toString());
            return;
        }
        const reasonInfo = constants_1.WebsocketCloseReason.find((v) => v.code === code);
        if (reasonInfo) {
            this.session.getBot().logger.info(`[WebSocketReceiver] 连接关闭：${reasonInfo.reason}`);
            if (reasonInfo.resume) {
                hasInternalReconnect = true;
                this.reconnect();
            }
        }
        else {
            this.session.getBot().logger.warn(`[WebSocketReceiver] 连接关闭，未知错误代码: ${code}, 原因: ${reason.toString() || 'unknown'}`);
            if (this.retryCount < this.config.maxRetries) {
                hasInternalReconnect = true;
                this.reconnect(false);
            }
            else {
                this.session.getBot().logger.error('[WebSocketReceiver] 重连次数过多，停止重连');
            }
        }
        if (!hasInternalReconnect) {
            this.emitClose(code, reason.toString());
        }
    }
    /**
     * 重连逻辑
     */
    async reconnect(resume = true, generation = this.lifecycleGeneration) {
        if (!this.isLifecycleActive(generation))
            return;
        this.retryCount++;
        this.session.getBot().logger.error(`[WebSocketReceiver] 连接断开，第${this.retryCount}次重连...`);
        // 指数退避策略
        const reconnectDelay = this.config.reconnectDelay || 5000;
        const delay = Math.min(reconnectDelay * Math.pow(2, this.retryCount - 1), 30000);
        this.session.getBot().logger.debug(`[WebSocketReceiver] 等待 ${delay}ms 后重连`);
        await new Promise(resolve => setTimeout(resolve, delay));
        if (!this.isLifecycleActive(generation))
            return;
        this.isReconnect = resume;
        try {
            await this.connect(generation);
        }
        catch (error) {
            this.session.getBot().logger.error(`[WebSocketReceiver] 重连失败: ${error.message}`);
            if (!this.isLifecycleActive(generation))
                return;
            if (this.retryCount < this.config.maxRetries) {
                await this.reconnect(resume, generation);
            }
            else {
                this.session.getBot().logger.error('[WebSocketReceiver] 重连次数达到上限，停止重连');
                this.session.emit('max_retry_reached');
            }
        }
    }
    /**
     * 断开连接
     */
    disconnect() {
        this.isClosed = true;
        this.clearTimers();
        this.handler.ws?.close();
    }
    /**
     * 判断异步连接任务是否仍属于当前启动周期。
     * stop() 会推进 lifecycleGeneration，使等待中的旧重连任务失效。
     */
    isLifecycleActive(generation) {
        return this._isStarted
            && generation === this.lifecycleGeneration
            && this.session !== null
            && !this.session.userClose;
    }
    /**
     * 清理定时器
     */
    clearTimers() {
        if (this.heartbeatTimer) {
            clearTimeout(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        if (this.heartbeatTimeoutTimer) {
            clearTimeout(this.heartbeatTimeoutTimer);
            this.heartbeatTimeoutTimer = null;
        }
    }
    /**
     * 处理数据包（基类抽象方法实现）
     */
    handlePacket(packet) {
        // WebSocket接收器的数据包处理在handleMessage中进行
        // 这里不需要额外处理
    }
    /**
     * 获取接收器类型
     */
    getType() {
        return base_1.ReceiverMode.WEBSOCKET;
    }
    /**
     * 获取接收器配置
     */
    getConfig() {
        return this.config.toJson();
    }
    /**
     * 健康检查
     */
    healthCheck() {
        const baseHealth = super.healthCheck();
        return {
            ...baseHealth,
            details: {
                ...baseHealth.details,
                wsReadyState: this.handler.ws?.readyState || 'N/A',
                retryCount: this.retryCount,
                lastHeartbeatAck: this.lastHeartbeatAck,
                heartbeatInterval: this.heartbeatInterval
            }
        };
    }
}
exports.WebSocketReceiver = WebSocketReceiver;
/**
 * 创建WebSocket接收器的工厂函数（向后兼容）
 */
function createWebsocketReceiver(config) {
    return new WebSocketReceiver(config);
}
