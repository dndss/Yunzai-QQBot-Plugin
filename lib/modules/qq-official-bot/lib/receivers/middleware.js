"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MiddlewareReceiver = exports.MiddlewareReceiverConfig = void 0;
exports.createMiddlewareReceiver = createMiddlewareReceiver;
const base_1 = require("./base");
const constants_1 = require("../constants");
const ed25519_1 = require("../ed25519");
/**
 * Middleware接收器配置
 */
class MiddlewareReceiverConfig extends base_1.BaseReceiverConfig {
    constructor(options) {
        super(base_1.ReceiverMode.MIDDLEWARE);
        this.platform = options.platform;
        this.timeout = options.timeout || 30000;
    }
    validate() {
        return ['koa', 'express'].includes(this.platform) && this.timeout > 0;
    }
    toJson() {
        return {
            mode: this.mode,
            platform: this.platform,
            timeout: this.timeout
        };
    }
}
exports.MiddlewareReceiverConfig = MiddlewareReceiverConfig;
/**
 * Middleware接收器实现
 */
class MiddlewareReceiver extends base_1.BaseReceiver {
    constructor(config) {
        const middleware = MiddlewareReceiver.createMiddleware(config.platform);
        super({
            middleware: () => middleware
        });
        this.session = null;
        this.config = config;
        this.setupMiddlewareEventHandlers();
    }
    /**
     * 创建对应平台的中间件
     */
    static createMiddleware(platform) {
        switch (platform) {
            case 'koa':
                return (async function (ctx, next) {
                    if (next)
                        await next();
                    return this.handleWebhookRequest(ctx.req, ctx.res, this.handler.ed25519, ctx.request.body);
                });
            case 'express':
                return (async function (req, res) {
                    return this.handleWebhookRequest(req, res, this.handler.ed25519);
                });
            default:
                throw new Error(`Unsupported platform: ${platform}`);
        }
    }
    /**
     * 设置Middleware特定的事件处理器
     */
    setupMiddlewareEventHandlers() {
        this.on('start', this.handleStart.bind(this));
        this.on('stop', this.handleStop.bind(this));
    }
    /**
     * 启动Middleware接收器
     */
    async start(session) {
        this.session = session;
        this._isStarted = true;
        // 初始化Ed25519签名验证
        this.handler.ed25519 = new ed25519_1.Ed25519(session.getBot().config.secret);
        // 绑定中间件的this上下文
        const originalMiddleware = this.handler.middleware;
        this.handler.middleware = () => {
            const middleware = originalMiddleware();
            return middleware.bind(this);
        };
        this.emitReady();
    }
    /**
     * 停止Middleware接收器
     */
    async stop(session) {
        this._isStarted = false;
        this.handler.ed25519 = undefined;
        this.emitClose();
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
     * 获取中间件函数
     */
    getMiddleware() {
        return this.handler.middleware();
    }
    /**
     * 处理Webhook请求
     */
    async handleWebhookRequest(req, res, ed25519, fallbackData) {
        if (!this.session || !ed25519) {
            this.handleError(res, 'Server not ready', 500);
            return;
        }
        try {
            const bodyData = await this.resolveBodyData(req, JSON.stringify(fallbackData));
            // 验证签名
            const signature = req.headers['x-signature-ed25519']?.toString();
            const timestamp = req.headers['x-signature-timestamp']?.toString();
            if (!signature) {
                this.session.getBot().logger.warn('[MiddlewareReceiver] 缺少签名头');
                this.handleError(res, 'Missing signature', 400);
                return;
            }
            if (!ed25519.verify(signature, timestamp + bodyData)) {
                this.session.getBot().logger.warn('[MiddlewareReceiver] 签名验证失败');
                this.handleError(res, 'Invalid signature', 401);
                return;
            }
            // 解析数据包
            let packet;
            try {
                packet = JSON.parse(bodyData);
            }
            catch (error) {
                this.session.getBot().logger.error('[MiddlewareReceiver] 数据包解析失败:', error);
                this.handleError(res, 'Invalid JSON', 400);
                return;
            }
            // 处理不同类型的操作
            switch (packet.op) {
                case constants_1.OpCode.SIGN_VERIFY:
                    await this.handleSignVerify(packet, res, ed25519);
                    break;
                case constants_1.OpCode.DISPATCH:
                    await this.handleDispatch(packet, res);
                    break;
                default:
                    this.session.getBot().logger.warn(`[MiddlewareReceiver] 未知的操作码: ${packet.op}`);
                    this.handleError(res, 'Unknown operation', 400);
            }
        }
        catch (error) {
            this.handleRequestError(res, error);
        }
    }
    /**
     * 处理签名验证
     */
    async handleSignVerify(packet, res, ed25519) {
        if (!this.session)
            return;
        const { plain_token, event_ts } = packet.d;
        const signed = ed25519.sign(event_ts + plain_token);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            plain_token,
            signature: signed
        }));
        this.session.getBot().logger.debug('[MiddlewareReceiver] 处理签名验证完成');
    }
    /**
     * 处理事件分发
     */
    async handleDispatch(packet, res) {
        if (!this.session)
            return;
        this.session.getBot().logger.debug('[MiddlewareReceiver] 收到事件:', packet.t);
        // 发送packet事件
        this.emitPacket(packet);
        // 返回成功响应
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, message: 'success' }));
    }
    /**
     * 解析请求体数据
     */
    async resolveBodyData(req, fallbackData) {
        return new Promise((resolve) => {
            if (fallbackData) {
                resolve(fallbackData);
                return;
            }
            const dataArr = [];
            req.on('data', (data) => {
                dataArr.push(data);
            });
            req.on('end', () => {
                resolve(Buffer.concat(dataArr).toString());
            });
        });
    }
    /**
     * 处理错误响应
     */
    handleError(res, message, statusCode) {
        if (!res.headersSent) {
            res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
            res.end(message);
        }
    }
    /**
     * 处理请求错误
     */
    handleRequestError(res, error) {
        if (this.session) {
            this.session.getBot().logger.error('[MiddlewareReceiver] 请求处理错误:', error);
        }
        this.emitError(error);
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
        }
    }
    /**
     * 处理数据包（基类抽象方法实现）
     */
    handlePacket(packet) {
        // Middleware接收器的数据包处理在handleWebhookRequest中进行
        // 这里不需要额外处理
    }
    /**
     * 获取接收器类型
     */
    getType() {
        return base_1.ReceiverMode.MIDDLEWARE;
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
                platform: this.config.platform,
                hasEd25519: !!this.handler.ed25519,
                hasMiddleware: typeof this.handler.middleware === 'function'
            }
        };
    }
}
exports.MiddlewareReceiver = MiddlewareReceiver;
/**
 * 创建Middleware接收器的工厂函数（向后兼容）
 */
function createMiddlewareReceiver(platform) {
    const config = new MiddlewareReceiverConfig({ platform });
    return new MiddlewareReceiver(config);
}
