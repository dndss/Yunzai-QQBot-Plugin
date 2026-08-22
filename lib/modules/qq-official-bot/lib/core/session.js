"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Session = exports.MAX_RETRY = void 0;
const events_1 = require("events");
const receivers_1 = require("../receivers");
const constants_1 = require("../constants");
// 导入重构后的管理器
const connection_1 = require("./connection");
const auth_1 = require("../core/auth");
const receivers_2 = require("../receivers");
exports.MAX_RETRY = 10;
/**
 * 重构后的会话管理器
 * 现在作为连接管理、认证管理和接收器管理的协调者
 */
class Session extends events_1.EventEmitter {
    // 保持向后兼容的公共属性
    get access_token() {
        return this.authManager.getCurrentTokenInfo()?.access_token || "";
    }
    get wsUrl() {
        return this._wsUrl || "";
    }
    get retry() {
        return this.connectionManager.getConnectionState().retry;
    }
    get alive() {
        return this.connectionManager.isAlive();
    }
    get sessionRecord() {
        const state = this.connectionManager.getConnectionState();
        return {
            sessionID: state.sessionID,
            seq: state.seq
        };
    }
    get heartbeatParam() {
        return this._heartbeatParam;
    }
    // 公共方法访问 bot 实例（用于 receiver）
    getBot() {
        return this.bot;
    }
    constructor(bot) {
        super();
        this._wsUrl = "";
        this._heartbeatParam = {
            op: 1, // OpCode.HEARTBEAT
            d: null
        };
        // 废弃属性
        this.heartbeatInterval = 30000;
        this.isReconnect = false;
        this.userClose = false;
        this.bot = bot;
        // 初始化认证管理器
        const authOptions = {
            appid: bot.config.appid,
            secret: bot.config.secret,
            maxRetries: 3,
            tokenRefreshBuffer: 45
        };
        if (bot.config.mode === receivers_1.ReceiverMode.WEBSOCKET) {
            const wsConfig = bot.config;
            if (wsConfig.accessTokenUrl)
                authOptions.accessTokenUrl = wsConfig.accessTokenUrl;
            if (wsConfig.gatewayUrl)
                authOptions.gatewayUrl = wsConfig.gatewayUrl;
        }
        this.authManager = new auth_1.Auth(authOptions, bot);
        // 初始化连接管理器
        this.connectionManager = new connection_1.Connection(bot, {
            maxRetry: bot.config.maxRetry || exports.MAX_RETRY,
            heartbeatInterval: 30000,
            reconnectDelay: 5000
        });
        // 创建接收器
        this.receiver = this.createReceiver();
        // 设置事件处理
        this.setupEventHandlers();
    }
    /**
     * 创建对应模式的接收器
     */
    createReceiver() {
        if (this.bot.config.mode === receivers_1.ReceiverMode.WEBSOCKET) {
            const config = this.bot.config;
            const websocketConfig = receivers_1.ReceiverConfigBuilder.websocket({
                heartbeatInterval: config.heartbeatInterval,
                maxRetries: config.maxRetries ?? config.maxRetry,
                reconnectDelay: config.reconnectDelay
            });
            return receivers_2.ReceiverFactory.createReceiver(this.bot.config.appid, this.bot.config.mode, websocketConfig);
        }
        return receivers_2.ReceiverFactory.createReceiver(this.bot.config.appid, this.bot.config.mode, this.bot.config);
    }
    /**
     * 设置事件处理器
     */
    setupEventHandlers() {
        // 接收器事件处理
        this.receiver.on("packet", (packet) => {
            this.bot.dispatchEvent(packet.t, packet);
        });
        // 连接管理器事件转发
        this.connectionManager.on(constants_1.SessionEvents.EVENT_WS, (data) => {
            this.emit(constants_1.SessionEvents.EVENT_WS, data);
        });
        this.connectionManager.on(constants_1.SessionEvents.ERROR, (code, message) => {
            this.emit(constants_1.SessionEvents.ERROR, code, message);
        });
        this.connectionManager.on(constants_1.SessionEvents.DEAD, (data) => {
            this.emit(constants_1.SessionEvents.DEAD, data);
        });
        // 连接事件处理
        this.connectionManager.on('connecting', () => {
            this.bot.logger.debug("[SESSION] 开始连接");
        });
        this.connectionManager.on('connect', async () => {
            try {
                // 获取网关地址
                this._wsUrl = await this.authManager.getGatewayUrl();
                // 启动接收器
                this.receiver.emit('start', this);
            }
            catch (error) {
                this.bot.logger.error("[SESSION] 连接准备失败:", error);
                this.connectionManager.emit(constants_1.SessionEvents.ERROR, -1, `连接准备失败: ${error}`);
            }
        });
        this.connectionManager.on('disconnect', () => {
            this.receiver.emit('stop', this);
        });
        this.connectionManager.on('heartbeat', (heartbeatData) => {
            this._heartbeatParam = heartbeatData;
        });
        // 接收器事件处理
        this.receiver.on('ready', () => {
            this.connectionManager.emit(constants_1.SessionEvents.EVENT_WS, {
                eventType: constants_1.SessionEvents.READY
            });
        });
        this.receiver.on('error', (error) => {
            this.connectionManager.emit(constants_1.SessionEvents.ERROR, -1, error.message || error);
        });
        this.receiver.on('close', (code, reason) => {
            this.connectionManager.emit(constants_1.SessionEvents.EVENT_WS, {
                eventType: constants_1.SessionEvents.DISCONNECT,
                code,
                eventMsg: this.sessionRecord
            });
        });
    }
    /**
     * 获取访问令牌
     */
    async getAccessToken() {
        const tokenInfo = await this.authManager.refreshAccessToken();
        return {
            access_token: tokenInfo.access_token,
            expires_in: tokenInfo.expires_in,
        };
    }
    /**
     * 获取WebSocket连接地址
     */
    async getWsUrl() {
        this._wsUrl = await this.authManager.getGatewayUrl();
        return this._wsUrl;
    }
    /**
     * 获取有效的意图值
     */
    getValidIntends() {
        return (this.bot.config.intents || []).reduce((result, item) => {
            const value = constants_1.Intends[item];
            if (value === undefined) {
                this.bot.logger.warn(`无效的意图(${item})，已跳过...`);
                return result;
            }
            return value | result;
        }, 0);
    }
    async start() {
        await this.getAccessToken();
        return new Promise((resolve) => {
            this.receiver.once('ready', resolve);
            this.receiver.emit('start', this);
        });
    }
    async stop() {
        this.userClose = true;
        await this.connectionManager.disconnect();
    }
    /**
     * 更新会话记录（用于WebSocket接收器）
     */
    updateSessionRecord(record) {
        this.connectionManager.updateSessionRecord(record);
    }
}
exports.Session = Session;
