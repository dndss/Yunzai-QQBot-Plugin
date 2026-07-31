"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseReceiverConfig = exports.ReceiverMode = exports.BaseReceiver = void 0;
const events_1 = require("events");
/**
 * 基础接收器抽象类
 * 定义了所有接收器的通用接口和生命周期管理
 */
class BaseReceiver extends events_1.EventEmitter {
    constructor(handler) {
        super();
        /**
         * 接收器状态
         */
        this._isStarted = false;
        this._isReady = false;
        this._lastError = null;
        this.handler = handler;
        this.setupBaseEventHandlers();
    }
    /**
     * 获取接收器状态
     */
    get isStarted() {
        return this._isStarted;
    }
    get isReady() {
        return this._isReady;
    }
    get lastError() {
        return this._lastError;
    }
    /**
     * 设置基础事件处理器
     */
    setupBaseEventHandlers() {
        this.on('ready', () => {
            this._isReady = true;
        });
        this.on('error', (error) => {
            this._lastError = error;
        });
        this.on('close', () => {
            this._isReady = false;
        });
    }
    /**
     * 重启接收器（默认实现）
     */
    async restart(session) {
        await this.stop(session);
        await this.start(session);
    }
    /**
     * 发送packet事件（统一处理）
     */
    emitPacket(packet) {
        this.emit('packet', packet);
    }
    /**
     * 发送ready事件（统一处理）
     */
    emitReady() {
        this.emit('ready');
    }
    /**
     * 发送error事件（统一处理）
     */
    emitError(error) {
        this.emit('error', error);
    }
    /**
     * 发送close事件（统一处理）
     */
    emitClose(code, reason) {
        this.emit('close', code, reason);
    }
    /**
     * 健康检查（默认实现）
     */
    healthCheck() {
        const status = this._isStarted && this._isReady ? 'healthy' : 'unhealthy';
        return {
            status,
            details: {
                isStarted: this._isStarted,
                isReady: this._isReady,
                lastError: this._lastError?.message || null,
                type: this.getType()
            }
        };
    }
}
exports.BaseReceiver = BaseReceiver;
/**
 * 接收器模式枚举
 */
var ReceiverMode;
(function (ReceiverMode) {
    ReceiverMode["WEBSOCKET"] = "websocket";
    ReceiverMode["WEBHOOK"] = "webhook";
    ReceiverMode["MIDDLEWARE"] = "middleware";
})(ReceiverMode || (exports.ReceiverMode = ReceiverMode = {}));
/**
 * 接收器配置基类
 */
class BaseReceiverConfig {
    constructor(mode) {
        this.mode = mode;
    }
}
exports.BaseReceiverConfig = BaseReceiverConfig;
