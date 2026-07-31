"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMiddlewareReceiver = exports.createWebhookReceiver = exports.createWebsocketReceiver = exports.ReceiverConfigBuilder = exports.ReceiverFactory = exports.ReceiverMode = void 0;
const base_1 = require("./base");
const websocket_1 = require("./websocket");
const webhook_1 = require("./webhook");
const middleware_1 = require("./middleware");
var base_2 = require("./base");
Object.defineProperty(exports, "ReceiverMode", { enumerable: true, get: function () { return base_2.ReceiverMode; } });
/**
 * 接收器工厂类
 * 统一管理不同类型接收器的创建和配置
 */
class ReceiverFactory {
    /**
     * 创建WebSocket接收器
     */
    static createWebSocketReceiver(appid, config) {
        const receiver = new websocket_1.WebSocketReceiver(config);
        this.registerReceiver(appid, base_1.ReceiverMode.WEBSOCKET, receiver);
        return receiver;
    }
    /**
     * 创建Webhook接收器
     */
    static createWebhookReceiver(appid, config) {
        const receiver = new webhook_1.WebhookReceiver(config);
        this.registerReceiver(appid, base_1.ReceiverMode.WEBHOOK, receiver);
        return receiver;
    }
    /**
     * 创建Middleware接收器
     */
    static createMiddlewareReceiver(appid, config) {
        const receiver = new middleware_1.MiddlewareReceiver(config);
        this.registerReceiver(appid, base_1.ReceiverMode.MIDDLEWARE, receiver);
        return receiver;
    }
    /**
     * 根据模式和配置创建接收器
     */
    static createReceiver(appid, mode, config) {
        switch (mode) {
            case base_1.ReceiverMode.WEBSOCKET:
                return this.createWebSocketReceiver(appid, config);
            case base_1.ReceiverMode.WEBHOOK:
                return this.createWebhookReceiver(appid, config);
            case base_1.ReceiverMode.MIDDLEWARE:
                return this.createMiddlewareReceiver(appid, config);
            default:
                throw new Error(`Unknown receiver mode: ${mode}`);
        }
    }
    /**
     * 注册接收器实例
     */
    static registerReceiver(appid, mode, receiver) {
        const key = `${appid}:${mode}`;
        if (this.receivers.has(key)) {
            throw new Error(`Receiver mode ${mode} for ${appid} already exists`);
        }
        this.receivers.set(mode, receiver);
    }
    /**
     * 获取注册的接收器实例
     */
    static getReceiver(appid, mode) {
        const key = `${appid}:${mode}`;
        return this.receivers.get(key);
    }
    /**
     * 移除接收器实例
     */
    static removeReceiver(appid, mode) {
        const key = `${appid}:${mode}`;
        return this.receivers.delete(key);
    }
    /**
     * 获取所有注册的接收器
     */
    static getAllReceivers() {
        return new Map(this.receivers);
    }
    /**
     * 清空所有接收器
     */
    static clearAll() {
        this.receivers.clear();
    }
    /**
     * 获取接收器健康状态
     */
    static getHealthStatus() {
        const status = {};
        for (const [mode, receiver] of this.receivers) {
            status[mode] = receiver.healthCheck();
        }
        return status;
    }
}
exports.ReceiverFactory = ReceiverFactory;
/**
 * 注册的接收器实例
 */
ReceiverFactory.receivers = new Map();
/**
 * 接收器配置构建器
 */
class ReceiverConfigBuilder {
    /**
     * 构建WebSocket接收器配置
     */
    static websocket(options = {}) {
        return new websocket_1.WebSocketReceiverConfig(options);
    }
    /**
     * 构建Webhook接收器配置
     */
    static webhook(options) {
        return new webhook_1.WebhookReceiverConfig(options);
    }
    /**
     * 构建Middleware接收器配置
     */
    static middleware(options) {
        return new middleware_1.MiddlewareReceiverConfig(options);
    }
}
exports.ReceiverConfigBuilder = ReceiverConfigBuilder;
// 向后兼容的工厂函数导出
var websocket_2 = require("./websocket");
Object.defineProperty(exports, "createWebsocketReceiver", { enumerable: true, get: function () { return websocket_2.createWebsocketReceiver; } });
var webhook_2 = require("./webhook");
Object.defineProperty(exports, "createWebhookReceiver", { enumerable: true, get: function () { return webhook_2.createWebhookReceiver; } });
var middleware_2 = require("./middleware");
Object.defineProperty(exports, "createMiddlewareReceiver", { enumerable: true, get: function () { return middleware_2.createMiddlewareReceiver; } });
