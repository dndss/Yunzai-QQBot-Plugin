import * as log4js from 'log4js';
import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { ed25519 } from '@noble/curves/ed25519';
import { Server, IncomingMessage, ServerResponse } from 'http';
import { BinaryLike } from 'crypto';
import { AxiosInstance, type AxiosInstance } from 'axios';
export enum OpCode {
    DISPATCH = 0,// 服务端进行消息推送
    HEARTBEAT = 1,// 客户端发送心跳
    IDENTIFY = 2,// 鉴权
    RESUME = 6,// 恢复连接
    RECONNECT = 7,// 服务端通知客户端重连
    INVALID_SESSION = 9,// 当identify或resume的时候，如果参数有错，服务端会返回该消息
    HELLO = 10,// 当客户端与网关建立ws连接之后，网关下发的第一条消息
    HEARTBEAT_ACK = 11,// 当发送心跳成功之后，就会收到该消息
    HTTP_CALLBACK_ACK = 12,// 仅用于 http 回调模式的回包，代表机器人收到了平台推送的数据
    SIGN_VERIFY = 13
}
export const UnsupportedMethodError: Error;
export const SessionEvents: {
    CLOSED: string;
    READY: string;
    ERROR: string;
    INVALID_SESSION: string;
    RECONNECT: string;
    DISCONNECT: string;
    EVENT_WS: string;
    RESUMED: string;
    DEAD: string;
};
export const WebsocketCloseReason: ({
    code: number;
    reason: string;
    resume?: undefined;
} | {
    code: number;
    reason: string;
    resume: boolean;
})[];
export enum Intends {
    GUILDS = 1,// 频道操作事件
    GUILD_MEMBERS = 2,// 频道成员变更事件
    GUILD_MESSAGES = 512,// 私域频道消息事件
    GUILD_MESSAGE_REACTIONS = 1024,// 频道消息表态事件
    DIRECT_MESSAGE = 4096,// 频道私信事件
    GROUP_MEMBER = 16777216,// 群成员变更事件
    GROUP_AND_C2C_EVENT = 33554432,// 私聊与群聊消息事件
    INTERACTION = 67108864,// 互动事件
    MESSAGE_AUDIT = 134217728,// 消息审核事件
    FORUMS_EVENT = 268435456,// 论坛事件(仅私域)
    AUDIO_ACTION = 536870912,// 音频操作事件
    PUBLIC_GUILD_MESSAGES = 1073741824
}
export type Intent = 'GUILDS' | 'GUILD_MEMBERS' | 'GUILD_MESSAGES' | 'GUILD_MESSAGE_REACTIONS' | 'DIRECT_MESSAGE' | 'GROUP_MEMBER' | 'GROUP_AND_C2C_EVENT' | 'INTERACTION' | 'MESSAGE_AUDIT' | 'FORUMS_EVENT' | 'AUDIO_ACTION' | 'PUBLIC_GUILD_MESSAGES';
export enum ChannelType {
    Content = 0,// 文本频道
    Record = 2,// 语音频道
    ChannelGroup = 4,// 频道分组
    Live = 10005,// 直播频道
    App = 10006,// 应用频道
    Forms = 10007
}
export enum ChannelSubType {
    Chat = 0,// 闲聊
    Announces = 1,// 公告
    Strategy = 2,// 攻略
    Black = 3
}
export enum PrivateType {
    Public = 0,// 公开
    Admin = 1,// 频道主和管理员
    Some = 2
}
export enum SpeakPermission {
    All = 1,// 所有人
    Some = 2
}
export namespace Channel {
    interface Info {
        id: string;
        guild_id: string;
        name: string;
        type: ChannelType;
        sub_type: ChannelSubType;
        position: number;
        parent_id?: string;
        owner_id: string;
        private_type: PrivateType;
        speak_permission: SpeakPermission;
        application_id?: string;
        permissions?: string;
    }
    type ApiInfo = Omit<Info, 'id' | 'name'> & {
        channel_id: string;
        channel_name: string;
    };
}
export namespace Guild {
    interface Info {
        id: string;
        name: string;
        icon: string;
        owner_id: string;
        owner: boolean;
        join_time: number;
        member_count: number;
        max_members: number;
        description: string;
    }
    type ApiInfo = Omit<Info, 'id' | 'name'> & {
        guild_id: string;
        guild_name: string;
    };
    interface Role {
        id: string;
        name: string;
        color: string;
        hoist: boolean;
        number: number;
        member_limit: number;
    }
}
export namespace User {
    interface Info {
        id: string;
        username: string;
        avatar: string;
        bot: boolean;
        public_flag: number;
    }
    enum Permission {
        normal = 1,
        admin = 2,
        owner = 4,
        channelAdmin = 5
    }
}
export namespace GuildMember {
    interface Info {
        user: User.Info;
        nick: string;
        roles: string[];
        join_time: number;
    }
    interface ApiInfo {
        member_id: string;
        username: string;
        avatar: string;
        card: string;
        bot?: boolean;
        roles: string[];
        join_time: number;
        union_openid?: string;
        union_user_account?: string;
    }
}
export type Dict<T = any, K extends string | symbol = string> = Record<K, T>;
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "mark" | "off";
export interface DataPacket {
    op: number;
    d?: Record<string, any>;
    s: number;
    t: string;
    id?: string;
}
export enum AnnounceType {
    Member = 0,
    WelCome = 1
}
export type Announce = {
    guild_id: string;
    channel_id: string;
    message_id: string;
    announces_type: AnnounceType;
    recommend_channels: {
        channel_id: string;
        introduce: string;
    }[];
};
export type ChannelPermissions = {
    channel_id: string;
    permissions: string;
};
export type ChannelMemberPermissions = {
    user_id: string;
} & ChannelPermissions;
export type ChannelRolePermissions = {
    role_id: string;
} & ChannelPermissions;
export type UpdatePermissionParams = {
    add?: string;
    remove?: string;
};
export type ChannelUpdateInfo = Partial<Pick<Channel.Info, 'name' | 'position' | 'parent_id' | 'private_type' | 'speak_permission'>>;
export type RoleCreateParam = {
    name?: string;
    color: number;
    hoist: 0 | 1;
};
export type RoleUpdateParam = Partial<Pick<Guild.Role, 'id' | 'name' | 'color' | 'hoist'>>;
export type PinsMessage = {
    guild_id: string;
    channel_id: string;
    message_ids: string[];
};
export interface DMS {
    guild_id: string;
    channel_id: string;
    create_time: number;
}
export interface ScheduleInfo {
    id?: string;
    name: string;
    description?: string;
    start_timestamp: string;
    end_timestamp: string;
    creator?: GuildMember.ApiInfo;
    jump_channel_id: string;
    remind_type: RemindType;
}
export type RemindType = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type AudioStatus = 0 | 1 | 2 | 3;
export interface AudioControl {
    audio_url?: string;
    text?: string;
    status: AudioStatus;
}
export interface AudioAction {
    guild_id: string;
    channel_id: string;
    audio_url: string;
    text: string;
}
export interface Thread {
    guild_id: string;
    channel_id: string;
    author_id: string;
    thread_info: ThreadInfo;
}
export interface ThreadInfo {
    thread_id: string;
    title: string;
    content: string;
    date_time: number;
}
export interface Post {
    guild_id: string;
    channel_id: string;
    author_id: string;
    post_info: PostInfo;
}
export interface PostInfo {
    thread_id: string;
    post_id: string;
    content: string;
    date_time: number;
}
export interface Reply {
    guild_id: string;
    channel_id: string;
    author_id: string;
    reply_info: ReplyInfo;
}
export interface ReplyInfo {
    thread_id: string;
    post_id: string;
    reply_id: string;
    content: string;
    date_time: number;
}
export type ApiPermissionDemand = {
    guild_id: string;
    channel_id: string;
    api_identify: ApiBaseInfo;
    title: string;
    desc: string;
};
export type ApiBaseInfo = {
    path: string;
    method: "GET" | "POST" | "DELETE" | "PATCH" | "PUT";
};
export type RecommendInfo = {
    channel_id: string;
    introduce: string;
};
export enum AuditType {
    Thread = 1,
    Post = 2,
    Reply = 3
}
export type ReactionTarget = {
    id: string;
    type: ReactionTargetType;
};
export type Emoji = {
    id: string;
    type: EmojiType;
};
export enum EmojiType {
    System = 1,
    Emoji = 2
}
export enum ReactionTargetType {
    Message = 0,
    Thread = 1,
    Comment = 2,
    Reply = 3,
    ReactionTargetType_MSG = "ReactionTargetType_MSG"
}
export interface GatewayInfo {
    url: string;
    shards?: number;
    session_start_limit?: {
        total: number;
        remaining: number;
        reset_after: number;
        max_concurrency: number;
    };
}
/**
 * 基础接收器抽象类
 * 定义了所有接收器的通用接口和生命周期管理
 */
export abstract class BaseReceiver<T extends object = object> extends EventEmitter {
    /**
     * 接收器处理器对象，包含具体的连接或服务器实例
     */
    readonly handler: T;
    /**
     * 接收器状态
     */
    protected _isStarted: boolean;
    protected _isReady: boolean;
    protected _lastError: Error | null;
    constructor(handler: T);
    /**
     * 获取接收器状态
     */
    get isStarted(): boolean;
    get isReady(): boolean;
    get lastError(): Error | null;
    /**
     * 设置基础事件处理器
     */
    private setupBaseEventHandlers;
    /**
     * 启动接收器（抽象方法）
     * @param session 会话管理器实例
     */
    abstract start(session: Session<any, any>): Promise<void>;
    /**
     * 停止接收器（抽象方法）
     * @param session 会话管理器实例
     */
    abstract stop(session?: Session<any, any>): Promise<void>;
    /**
     * 重启接收器（默认实现）
     */
    restart(session: Session<any, any>): Promise<void>;
    /**
     * 处理接收到的数据包（抽象方法）
     * @param packet 数据包
     */
    protected abstract handlePacket(packet: DataPacket): void;
    /**
     * 发送packet事件（统一处理）
     */
    protected emitPacket(packet: DataPacket): void;
    /**
     * 发送ready事件（统一处理）
     */
    protected emitReady(): void;
    /**
     * 发送error事件（统一处理）
     */
    protected emitError(error: Error): void;
    /**
     * 发送close事件（统一处理）
     */
    protected emitClose(code?: number, reason?: string): void;
    /**
     * 获取接收器类型标识（抽象方法）
     */
    abstract getType(): string;
    /**
     * 获取接收器配置信息（抽象方法）
     */
    abstract getConfig(): Record<string, any>;
    /**
     * 健康检查（默认实现）
     */
    healthCheck(): {
        status: 'healthy' | 'unhealthy';
        details: any;
    };
}
/**
 * 接收器接口定义
 */
export interface IReceiver {
    start(session: Session<any, any>): Promise<void>;
    stop(session?: Session<any, any>): Promise<void>;
    restart(session: Session<any, any>): Promise<void>;
    getType(): string;
    getConfig(): Record<string, any>;
    healthCheck(): {
        status: 'healthy' | 'unhealthy';
        details: any;
    };
}
/**
 * 接收器模式枚举
 */
export enum ReceiverMode {
    WEBSOCKET = "websocket",
    WEBHOOK = "webhook",
    MIDDLEWARE = "middleware"
}
/**
 * 接收器配置基类
 */
export abstract class BaseReceiverConfig {
    readonly mode: ReceiverMode;
    constructor(mode: ReceiverMode);
    abstract validate(): boolean;
    abstract toJson(): Record<string, any>;
}
export const toObject: <T = any>(data: any) => T;
export function deepClone<T extends object>(obj: T): any;
/**
 * WebSocket接收器配置
 */
export class WebSocketReceiverConfig extends BaseReceiverConfig {
    readonly heartbeatInterval: number;
    readonly maxRetries: number;
    readonly reconnectDelay: number;
    constructor(options?: {
        heartbeatInterval?: number;
        maxRetries?: number;
        reconnectDelay?: number;
    });
    validate(): boolean;
    toJson(): Record<string, any>;
}
/**
 * WebSocket接收器处理器
 */
export interface WebSocketHandler {
    ws?: WebSocket;
}
/**
 * WebSocket接收器实现
 */
export class WebSocketReceiver extends BaseReceiver<WebSocketHandler> {
    private config;
    private session;
    private heartbeatInterval;
    private isReconnect;
    private retryCount;
    private isClosed;
    private heartbeatTimer;
    private heartbeatTimeoutTimer;
    private lastHeartbeatAck;
    constructor(config?: WebSocketReceiverConfig);
    /**
     * 设置WebSocket特定的事件处理器
     */
    private setupWebSocketEventHandlers;
    /**
     * 启动WebSocket连接
     */
    start(session: Session<ReceiverMode.WEBSOCKET>): Promise<void>;
    /**
     * 停止WebSocket连接
     */
    stop(session?: Session<ReceiverMode.WEBSOCKET>): Promise<void>;
    /**
     * 处理启动事件
     */
    private handleStart;
    /**
     * 处理停止事件
     */
    private handleStop;
    /**
     * 处理重启事件
     */
    private handleRestart;
    /**
     * 建立WebSocket连接
     */
    private connect;
    /**
     * 设置WebSocket连接的事件处理
     */
    private setupWebSocketConnection;
    /**
     * 处理WebSocket消息
     */
    private handleMessage;
    /**
     * 处理HELLO消息
     */
    private handleHello;
    /**
     * 处理DISPATCH事件
     */
    private handleDispatch;
    /**
     * 处理心跳ACK
     */
    private handleHeartbeatAck;
    /**
     * 处理重连请求
     */
    private handleReconnectRequest;
    /**
     * 处理无效会话
     */
    private handleInvalidSession;
    /**
     * 事件分发
     */
    private dispatchEvent;
    /**
     * 处理READY事件
     */
    private handleReadyEvent;
    /**
     * 处理RESUMED事件
     */
    private handleResumedEvent;
    /**
     * 恢复连接
     */
    private resumeConnection;
    /**
     * 认证
     */
    private authenticate;
    /**
     * 开始心跳
     */
    private startHeartbeat;
    /**
     * 发送心跳
     */
    private sendHeartbeat;
    /**
     * 发送消息到WebSocket
     */
    private sendMessage;
    /**
     * 处理WebSocket错误
     */
    private handleWebSocketError;
    /**
     * 处理WebSocket关闭
     */
    private handleWebSocketClose;
    /**
     * 重连逻辑
     */
    private reconnect;
    /**
     * 断开连接
     */
    private disconnect;
    /**
     * 清理定时器
     */
    private clearTimers;
    /**
     * 处理数据包（基类抽象方法实现）
     */
    protected handlePacket(packet: DataPacket): void;
    /**
     * 获取接收器类型
     */
    getType(): string;
    /**
     * 获取接收器配置
     */
    getConfig(): Record<string, any>;
    /**
     * 健康检查
     */
    healthCheck(): {
        status: 'healthy' | 'unhealthy';
        details: any;
    };
}
/**
 * 创建WebSocket接收器的工厂函数（向后兼容）
 */
export function createWebsocketReceiver(config?: WebSocketReceiverConfig): WebSocketReceiver;
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
export class Ed25519 {
    #private;
    constructor(secret: string);
    sign(message: string): string;
    verify(signature: string, message: string): boolean;
}
/**
 * ed25519 curve with EdDSA signatures.
 */
/**
 * Webhook接收器配置
 */
export class WebhookReceiverConfig extends BaseReceiverConfig {
    readonly port: number;
    readonly path: string;
    readonly timeout: number;
    constructor(options: {
        port: number;
        path: string;
        timeout?: number;
    });
    validate(): boolean;
    toJson(): Record<string, any>;
}
/**
 * Webhook接收器处理器
 */
export interface WebhookHandler {
    server: Server;
    ed25519?: Ed25519;
}
/**
 * Webhook接收器实现
 */
export class WebhookReceiver extends BaseReceiver<WebhookHandler> {
    private config;
    private session;
    constructor(config: WebhookReceiverConfig);
    /**
     * 设置Webhook特定的事件处理器
     */
    private setupWebhookEventHandlers;
    /**
     * 设置服务器请求处理器
     */
    private setupServerHandlers;
    /**
     * 启动Webhook服务器
     */
    start(session: Session<ReceiverMode.WEBHOOK>): Promise<void>;
    /**
     * 停止Webhook服务器
     */
    stop(session?: Session<ReceiverMode.WEBHOOK>): Promise<void>;
    /**
     * 处理启动事件
     */
    private handleStart;
    /**
     * 处理停止事件
     */
    private handleStop;
    /**
     * 处理HTTP请求
     */
    private handleHttpRequest;
    /**
     * 处理Webhook请求
     */
    private handleWebhookRequest;
    /**
     * 处理签名验证
     */
    private handleSignVerify;
    /**
     * 处理事件分发
     */
    private handleDispatch;
    /**
     * 解析请求体数据
     */
    private resolveBodyData;
    /**
     * 处理请求错误
     */
    private handleRequestError;
    /**
     * 处理服务器错误
     */
    private handleServerError;
    /**
     * 处理服务器开始监听
     */
    private handleServerListening;
    /**
     * 处理服务器关闭
     */
    private handleServerClose;
    /**
     * 处理数据包（基类抽象方法实现）
     */
    protected handlePacket(packet: DataPacket): void;
    /**
     * 获取接收器类型
     */
    getType(): string;
    /**
     * 获取接收器配置
     */
    getConfig(): Record<string, any>;
    /**
     * 健康检查
     */
    healthCheck(): {
        status: 'healthy' | 'unhealthy';
        details: any;
    };
}
/**
 * 创建Webhook接收器的工厂函数（向后兼容）
 */
export function createWebhookReceiver(port: number, path: string): WebhookReceiver;
/**
 * 应用平台类型
 */
export type ApplicationPlatform = 'koa' | 'express';
/**
 * Koa上下文类型
 */
export type KoaContext = {
    request: Record<string, any>;
    response: Record<string, any>;
    req: IncomingMessage;
    res: ServerResponse;
};
/**
 * 中间件类型定义
 */
export type Middleware<T extends ApplicationPlatform> = T extends 'koa' ? KoaMiddleware : ExpressMiddleware;
export type KoaMiddleware = (ctx: KoaContext, next?: () => Promise<any>) => Promise<any>;
export type ExpressMiddleware = (req: IncomingMessage, res: ServerResponse) => Promise<any>;
/**
 * Middleware接收器配置
 */
export class MiddlewareReceiverConfig extends BaseReceiverConfig {
    readonly platform: ApplicationPlatform;
    readonly timeout: number;
    constructor(options: {
        platform: ApplicationPlatform;
        timeout?: number;
    });
    validate(): boolean;
    toJson(): Record<string, any>;
}
/**
 * Middleware接收器处理器
 */
export interface MiddlewareHandler<T extends ApplicationPlatform> {
    middleware: () => Middleware<T>;
    ed25519?: Ed25519;
}
/**
 * Middleware接收器实现
 */
export class MiddlewareReceiver<T extends ApplicationPlatform> extends BaseReceiver<MiddlewareHandler<T>> {
    private config;
    private session;
    constructor(config: MiddlewareReceiverConfig);
    /**
     * 创建对应平台的中间件
     */
    private static createMiddleware;
    /**
     * 设置Middleware特定的事件处理器
     */
    private setupMiddlewareEventHandlers;
    /**
     * 启动Middleware接收器
     */
    start(session: Session<ReceiverMode.MIDDLEWARE>): Promise<void>;
    /**
     * 停止Middleware接收器
     */
    stop(session?: Session<ReceiverMode.MIDDLEWARE>): Promise<void>;
    /**
     * 处理启动事件
     */
    private handleStart;
    /**
     * 处理停止事件
     */
    private handleStop;
    /**
     * 获取中间件函数
     */
    getMiddleware(): Middleware<T>;
    /**
     * 处理Webhook请求
     */
    private handleWebhookRequest;
    /**
     * 处理签名验证
     */
    private handleSignVerify;
    /**
     * 处理事件分发
     */
    private handleDispatch;
    /**
     * 解析请求体数据
     */
    private resolveBodyData;
    /**
     * 处理错误响应
     */
    private handleError;
    /**
     * 处理请求错误
     */
    private handleRequestError;
    /**
     * 处理数据包（基类抽象方法实现）
     */
    protected handlePacket(packet: DataPacket): void;
    /**
     * 获取接收器类型
     */
    getType(): string;
    /**
     * 获取接收器配置
     */
    getConfig(): Record<string, any>;
    /**
     * 健康检查
     */
    healthCheck(): {
        status: 'healthy' | 'unhealthy';
        details: any;
    };
}
/**
 * 创建Middleware接收器的工厂函数（向后兼容）
 */
export function createMiddlewareReceiver<T extends ApplicationPlatform>(platform: T): MiddlewareReceiver<T>;
export type ResolveReceiver<T extends ReceiverMode, M extends ApplicationPlatform = never> = T extends ReceiverMode.WEBSOCKET ? WebSocketReceiver : T extends ReceiverMode.MIDDLEWARE ? MiddlewareReceiver<M> : WebhookReceiver;
export type ResolveConfig<T extends ReceiverMode, M extends ApplicationPlatform = never> = T extends ReceiverMode.WEBSOCKET ? ReceiveModeConfig<M>['websocket'] : T extends ReceiverMode.MIDDLEWARE ? ReceiveModeConfig<M>['middleware'] : ReceiveModeConfig<M>['webhook'];
export interface ReceiveModeConfig<M extends ApplicationPlatform> {
    websocket: {
        heartbeatInterval?: number;
        maxRetries?: number;
        reconnectDelay?: number;
        /** 获取 access token 的完整 URL */
        accessTokenUrl?: string;
        /** 获取网关信息的 URL 或路径，响应 url 为 WebSocket 地址 */
        gatewayUrl?: string;
    };
    middleware: {
        application: M;
    };
    webhook: {
        port: number;
        path: string;
    };
}
/**
 * 接收器工厂类
 * 统一管理不同类型接收器的创建和配置
 */
export class ReceiverFactory {
    /**
     * 注册的接收器实例
     */
    private static receivers;
    /**
     * 创建WebSocket接收器
     */
    static createWebSocketReceiver(appid: string, config?: WebSocketReceiverConfig): WebSocketReceiver;
    /**
     * 创建Webhook接收器
     */
    static createWebhookReceiver(appid: string, config: WebhookReceiverConfig): WebhookReceiver;
    /**
     * 创建Middleware接收器
     */
    static createMiddlewareReceiver<T extends ApplicationPlatform>(appid: string, config: MiddlewareReceiverConfig): MiddlewareReceiver<T>;
    /**
     * 根据模式和配置创建接收器
     */
    static createReceiver<T extends ReceiverMode = ReceiverMode, M extends ApplicationPlatform = ApplicationPlatform>(appid: string, mode: T, config: ResolveConfig<T, M>): ResolveReceiver<T, M>;
    /**
     * 注册接收器实例
     */
    static registerReceiver(appid: string, mode: ReceiverMode, receiver: BaseReceiver): void;
    /**
     * 获取注册的接收器实例
     */
    static getReceiver(appid: string, mode: string): BaseReceiver | undefined;
    /**
     * 移除接收器实例
     */
    static removeReceiver(appid: string, mode: string): boolean;
    /**
     * 获取所有注册的接收器
     */
    static getAllReceivers(): Map<string, BaseReceiver>;
    /**
     * 清空所有接收器
     */
    static clearAll(): void;
    /**
     * 获取接收器健康状态
     */
    static getHealthStatus(): Record<string, any>;
}
/**
 * 接收器配置构建器
 */
export class ReceiverConfigBuilder {
    /**
     * 构建WebSocket接收器配置
     */
    static websocket(options?: {
        heartbeatInterval?: number;
        maxRetries?: number;
        reconnectDelay?: number;
        accessTokenUrl?: string;
        gatewayUrl?: string;
    }): WebSocketReceiverConfig;
    /**
     * 构建Webhook接收器配置
     */
    static webhook(options: {
        port: number;
        path: string;
        timeout?: number;
    }): WebhookReceiverConfig;
    /**
     * 构建Middleware接收器配置
     */
    static middleware(options: {
        platform: ApplicationPlatform;
        timeout?: number;
    }): MiddlewareReceiverConfig;
}
/**
 * 连接管理器 - 负责管理与QQ API的连接
 * 从SessionManager中提取连接相关功能
 */
export interface ConnectionConfig {
    maxRetry?: number;
    heartbeatInterval?: number;
    reconnectDelay?: number;
}
export interface ConnectionState {
    sessionID: string;
    seq: number;
    retry: number;
    alive: boolean;
    isReconnect: boolean;
    userClose: boolean;
}
export interface HeartbeatData {
    op: OpCode;
    d: any;
}
/**
 * 连接管理器
 * 专门负责维护与QQ服务器的连接状态
 */
export class Connection extends EventEmitter {
    private bot;
    private config;
    private state;
    private heartbeatParam;
    private heartbeatTimer?;
    constructor(bot: Client, config?: ConnectionConfig);
    /**
     * 设置事件处理器
     */
    private setupEventHandlers;
    /**
     * 处理会话事件
     */
    private handleSessionEvent;
    /**
     * 处理重连
     */
    private handleReconnect;
    /**
     * 处理断开连接
     */
    private handleDisconnect;
    /**
     * 处理连接就绪
     */
    private handleReady;
    /**
     * 处理错误
     */
    private handleError;
    /**
     * 开始连接
     */
    connect(): Promise<void>;
    /**
     * 断开连接
     */
    disconnect(): Promise<void>;
    /**
     * 开始心跳
     */
    private startHeartbeat;
    /**
     * 停止心跳
     */
    private stopHeartbeat;
    /**
     * 发送心跳
     */
    private sendHeartbeat;
    /**
     * 更新会话记录
     */
    updateSessionRecord(record: {
        sessionID?: string;
        seq?: number;
    }): void;
    /**
     * 获取连接状态
     */
    getConnectionState(): Readonly<ConnectionState>;
    /**
     * 检查连接是否活跃
     */
    isAlive(): boolean;
    /**
     * 工具方法：延迟
     */
    private delay;
    /**
     * 清理资源
     */
    destroy(): void;
}
export interface AuthConfig {
    appid: string;
    secret: string;
    /** 获取 access token 的完整 URL，默认 https://bots.qq.com/app/getAppAccessToken */
    accessTokenUrl?: string;
    /** 获取网关信息的 URL 或路径，响应中的 url 为 WebSocket 地址；默认 /gateway/bot */
    gatewayUrl?: string;
    tokenRefreshBuffer?: number;
    maxRetries?: number;
    retryDelay?: number;
}
export interface TokenInfo {
    access_token: string;
    expires_in: number;
    token_type?: string;
    expires_at?: number;
}
/**
 * 认证管理器
 * 专门负责处理token获取、刷新和网关信息获取
 */
export class Auth {
    bot: Client;
    static readonly DEFAULT_ACCESS_TOKEN_URL = "https://bots.qq.com/app/getAppAccessToken";
    static readonly DEFAULT_GATEWAY_URL = "/gateway/bot";
    private static readonly MIN_REFRESH_DELAY_MS;
    private static readonly FALLBACK_REFRESH_RATIO;
    private static readonly REFRESH_RETRY_DELAY_MS;
    private config;
    private currentToken?;
    private refreshTimer?;
    private refreshRetryCount;
    private gatewayInfo?;
    constructor(config: AuthConfig, bot: Client);
    /**
     * 获取访问令牌
     * 如果当前token有效则返回，否则重新获取
     */
    getAccessToken(): Promise<string>;
    /**
     * 强制刷新访问令牌
     */
    refreshAccessToken(): Promise<TokenInfo>;
    /**
     * 获取网关连接地址
     */
    getGatewayUrl(): Promise<string>;
    /**
     * 获取完整的网关信息
     */
    getGatewayInfo(): Promise<GatewayInfo>;
    /**
     * 从API获取新的访问令牌
     */
    private fetchNewToken;
    /**
     * 从API获取网关信息
     */
    private fetchGatewayInfo;
    /**
     * 设置令牌并启动自动刷新
     */
    private setToken;
    /**
     * 计划令牌刷新
     */
    private scheduleTokenRefresh;
    private scheduleTokenRefreshRetry;
    /**
     * 检查当前令牌是否有效
     */
    private isTokenValid;
    /**
     * 获取当前令牌信息
     */
    getCurrentTokenInfo(): TokenInfo | null;
    /**
     * 检查认证状态
     */
    isAuthenticated(): boolean;
    /**
     * 清除认证信息
     */
    clearAuth(): void;
    /**
     * 工具方法：延迟
     */
    private delay;
    /**
     * 销毁认证管理器
     */
    destroy(): void;
}
export const MAX_RETRY = 10;
/**
 * 重构后的会话管理器
 * 现在作为连接管理、认证管理和接收器管理的协调者
 */
export class Session<T extends ReceiverMode, M extends ApplicationPlatform = never> extends EventEmitter {
    get access_token(): string;
    get wsUrl(): string;
    get retry(): number;
    get alive(): boolean;
    get sessionRecord(): {
        sessionID: string;
        seq: number;
    };
    get heartbeatParam(): {
        op: number;
        d: any;
    };
    readonly receiver: ResolveReceiver<T, M>;
    getBot(): Client<T, M>;
    private readonly bot;
    private readonly connectionManager;
    private readonly authManager;
    private _wsUrl;
    private _heartbeatParam;
    heartbeatInterval: number;
    isReconnect: boolean;
    userClose: boolean;
    constructor(bot: Client<T, M>);
    /**
     * 创建对应模式的接收器
     */
    private createReceiver;
    /**
     * 设置事件处理器
     */
    private setupEventHandlers;
    /**
     * 获取访问令牌
     */
    getAccessToken(): Promise<Client.Token>;
    /**
     * 获取WebSocket连接地址
     */
    getWsUrl(): Promise<string>;
    /**
     * 获取有效的意图值
     */
    getValidIntends(): number;
    start(): Promise<void>;
    stop(): Promise<void>;
    /**
     * 更新会话记录（用于WebSocket接收器）
     */
    updateSessionRecord(record: {
        sessionID?: string;
        seq?: number;
    }): void;
}
export enum MusicPlatform {
    qq = "qq",
    netease = "163"
}
export interface Quotable {
    id?: string;
    event_id?: string;
}
export interface ForwardMessageNode {
    index: number;
    sender_name: string;
    content: string;
    message_type?: 'forward';
    children?: ForwardMessageNode[];
}
export interface ForwardMessageData {
    title: string;
    nodes: ForwardMessageNode[];
    raw: string;
}
export interface MessageElemMap {
    text: {
        text: string;
    };
    at: {
        user_id: 'all' | string;
    };
    face: {
        /** face为0~348，sface不明 */
        id: number;
        /** 表情说明，接收消息时有效 */
        text?: string;
    };
    image: {
        /**
         * @type {string} 本地图片文件路径，例如"/tmp/1.jpg"
         * @type {string} base64协议数据，例如 "base64://*****" 或 "data:image/png;base64,iVBORw0KG
         * @type {string} 网络图片文件地址，例如"http://www.baidu.com/iconfont.png"
         * @type {Buffer} 图片Buffer数据
         */
        file: string | Buffer;
        url?: string;
        /** 仅接收有效 */
        name?: string;
    };
    video: {
        file: string;
        url?: string;
        /** 仅接收有效 */
        name?: string;
    };
    audio: {
        file: string;
        url?: string;
        /** 仅接收有效 */
        name?: string;
    };
    file: {
        file: string | Buffer;
        url?: string;
        name?: string;
    };
    /** 官方网关 message_type=102 展开的合并转发消息，仅接收有效 */
    forward: ForwardMessageData;
    markdown: {
        content: string;
        custom_template_id: never;
        params: never;
        /** 群聊和 C2C 私聊是否校验 Markdown 图片转存结果 */
        force_verify_image_resource?: boolean;
    } | {
        custom_template_id: string;
        content: never;
        params: {
            key: string;
            values: string;
        }[];
        /** 群聊和 C2C 私聊是否校验 Markdown 图片转存结果 */
        force_verify_image_resource?: boolean;
    };
    keyboard: {
        id: string;
    };
    reply: Quotable;
    link: {
        channel_id: string;
    };
    button: Dict;
    ark: {
        template_id: number;
        kv: Dict<string, 'key' | 'value'>[];
    };
    embed: {
        title: string;
        prompt: string;
        thumbnail: Dict<string>;
        fields: Dict<string, 'name'>[];
    };
}
export type MessageElemType = keyof MessageElemMap;
export type MessageElem<T extends MessageElemType = MessageElemType> = {
    type: T;
    data: MessageElemMap[T];
};
export type TextElem = MessageElem<"text">;
export type AtElem = MessageElem<"at">;
export type FaceElem = MessageElem<"face">;
export type ArkElem = MessageElem<'ark'>;
export type EmbedElem = MessageElem<'embed'>;
export type ImageElem = MessageElem<"image">;
export type VideoElem = MessageElem<"video">;
export type AudioElem = MessageElem<"audio">;
export type FileElem = MessageElem<"file">;
export type ForwardElem = MessageElem<"forward">;
export type LinkElem = MessageElem<'link'>;
export type MDElem = MessageElem<'markdown'>;
export type KeyboardElem = MessageElem<'keyboard'>;
export type ButtonElem = MessageElem<'button'>;
export type ReplyElem = MessageElem<"reply">;
type RepeatableCombineElem = string | TextElem | FaceElem | LinkElem | AtElem | ButtonElem;
type SingleWithRepeatEnd<T extends MessageElem> = [T, ...RepeatableCombineElem[]];
type SingleWithRepeat<T extends MessageElem> = [...RepeatableCombineElem[], T] | SingleWithRepeatEnd<T>;
type WithReply<T extends MessageElem> = T | [T] | SingleWithRepeat<T> | [ReplyElem, ...SingleWithRepeat<T>] | [ReplyElem, ...RepeatableCombineElem[]];
export type Sendable = RepeatableCombineElem | (RepeatableCombineElem)[] | WithReply<ImageElem | KeyboardElem | MDElem | ArkElem | EmbedElem | VideoElem | AudioElem | FileElem>;
/**
 * 消息段工厂函数集合
 * 提供便捷的消息段创建方法
 */
import type { MessageElem, MessageElemMap, TextElem, AtElem, FaceElem, ImageElem, VideoElem, AudioElem, FileElem, MDElem, ArkElem, EmbedElem, ButtonElem, LinkElem, ReplyElem, KeyboardElem, Quotable } from "elements";
import type { Dict } from "types";
/**
 * 消息段工厂函数
 */
export const segment: {
    /**
     * 创建文本消息段
     * @param text 文本内容
     */
    text(text: string): TextElem;
    /**
     * 创建@消息段
     * @param userId 用户ID，传入 'all' 表示@全体成员
     */
    at(userId: string | "all"): AtElem;
    /**
     * 创建表情消息段
     * @param id 表情ID（0~348）
     * @param text 表情说明文字（可选，接收消息时有效）
     */
    face(id: number, text?: string): FaceElem;
    /**
     * 创建图片消息段
     * @param file 图片文件路径、Buffer数据、base64数据或网络地址
     * @param options 可选参数
     */
    image(file: string | Buffer, options?: {
        url?: string;
        name?: string;
    }): ImageElem;
    /**
     * 创建视频消息段
     * @param file 视频文件路径或网络地址
     * @param options 可选参数
     */
    video(file: string, options?: {
        url?: string;
        name?: string;
    }): VideoElem;
    /**
     * 创建音频消息段
     * @param file 音频文件路径或网络地址
     * @param options 可选参数
     */
    audio(file: string, options?: {
        url?: string;
        name?: string;
    }): AudioElem;
    /**
     * 创建文件消息段
     * @param file 文件路径、Buffer数据、base64数据或网络地址
     * @param options 可选参数
     */
    file(file: string | Buffer, options?: {
        url?: string;
        name?: string;
    }): FileElem;
    /**
     * 创建Markdown消息段
     * @param content Markdown内容或自定义模板ID
     * @param params 模板参数（当第一个参数是模板ID时使用）
     */
    markdown(contentOrTemplateId: string, params?: {
        key: string;
        values: string;
    }[]): MDElem;
    /**
     * 创建ARK消息段
     * @param templateId 模板ID
     * @param kv 键值对数据
     */
    ark(templateId: number, kv: Dict<string, "key" | "value">[]): ArkElem;
    /**
     * 创建Embed消息段
     * @param title 标题
     * @param prompt 描述
     * @param thumbnail 缩略图
     * @param fields 字段列表
     */
    embed(title: string, prompt: string, thumbnail: Dict<string>, fields: Dict<string, "name">[]): EmbedElem;
    /**
     * 创建按钮消息段
     * @param data 按钮数据
     */
    button(data: Dict): ButtonElem;
    /**
     * 创建链接消息段
     * @param channelId 频道ID
     */
    link(channelId: string): LinkElem;
    /**
     * 创建回复消息段
     * @param idOrQuotable 消息ID、事件ID或Quotable对象
     */
    reply(idOrQuotable: string | Quotable): ReplyElem;
    /**
     * 创建键盘按钮组消息段
     * @param id 按钮组ID
     */
    keyboard(id: string): KeyboardElem;
};
export type { MessageElem, MessageElemMap };
export type SegmentFactory = typeof segment;
/** md5 hash */
export const md5: (data: BinaryLike) => string;
export function getBase64FromLocal(filepath: string): Promise<string>;
export function getBase64FromWeb(url: string): Promise<string>;
export function getFileBase64(file: string | Buffer): string | Promise<string>;
export function trimQuote(str: string): string;
/**
 * 消息构建器 - 专门负责构建消息内容
 */
export interface MessagePayload {
    msg_seq: number;
    content: string;
    msg_type?: number;
    msg_id?: string;
    event_id?: string;
    message_reference?: {
        message_id: string;
    };
    image?: string;
    file_image?: any;
    media?: {
        file_info: any;
    };
    markdown?: any;
    keyboard?: any;
    bot_appid?: string;
    ark?: any;
    embed?: any;
}
export interface FilePayload {
    file_type?: 1 | 2 | 3 | 4;
    url?: string;
    file_data?: any;
    file_name?: string;
    local_path?: string;
}
export interface BuildResult {
    messagePayload: MessagePayload;
    filePayload: FilePayload;
    isFile: boolean;
    contentType: string;
    brief: string;
}
/**
 * 消息构建器
 * 专门负责将Sendable类型的消息转换为API所需的格式
 */
export class MessageBuilder {
    private appid;
    private isGuild?;
    private source?;
    private messagePayload;
    private filePayload;
    private buttons;
    private isFile;
    private contentType;
    private brief;
    constructor(appid: string, isGuild?: boolean, source?: {
        id?: string;
        event_id?: string;
    });
    /**
     * 构建消息
     */
    build(message: Sendable): Promise<BuildResult>;
    /**
     * 处理消息内容
     */
    private processMessage;
    /**
     * 处理单个消息元素
     */
    private processElement;
    /**
     * 处理回复元素
     */
    private handleReply;
    /**
     * 处理@元素
     */
    private handleAt;
    /**
     * 处理链接元素
     */
    private handleLink;
    /**
     * 处理文本元素
     */
    private handleText;
    /**
     * 处理表情元素
     */
    private handleFace;
    /**
     * 处理媒体元素（图片、视频、音频）
     */
    private handleMedia;
    /**
     * 处理Markdown元素
     */
    private handleMarkdown;
    /**
     * 处理键盘元素
     */
    private handleKeyboard;
    /**
     * 处理按钮元素
     */
    private handleButton;
    /**
     * 处理嵌入元素
     */
    private handleEmbed;
    /**
     * 处理ARK元素
     */
    private handleArk;
    /**
     * 处理按钮组
     */
    private processButtons;
    /**
     * 从模板字符串解析消息元素
     */
    private parseFromTemplate;
    /**
     * 准备频道媒体数据
     */
    private formatMediaData;
    /**
     * 获取媒体类型编号
     */
    private getMediaType;
    private getFileName;
    private sanitizeFileName;
    /**
     * 获取文件哈希值
     */
    private getFileHash;
}
export interface FileUploadResult {
    file_info: any;
    url?: string;
    file_id?: string;
}
export interface UploadOptions {
    targetId: string;
    targetType: 'user' | 'group';
    fileType: 1 | 2 | 3 | 4;
    fileName?: string;
    sendMessage?: boolean;
}
/**
 * 文件处理器
 * 专门负责文件的上传、处理和管理
 */
export class FileProcessor<T extends ReceiverMode = ReceiverMode, M extends ApplicationPlatform = ApplicationPlatform> {
    private request;
    constructor(request: AxiosInstance);
    /**
     * 上传媒体文件
     */
    uploadMedia(fileData: string | Buffer, options: UploadOptions): Promise<FileUploadResult>;
    /**
     * 批量上传文件
     */
    uploadMultipleFiles(files: Array<{
        data: string | Buffer;
        type: 1 | 2 | 3 | 4;
    }>, options: Omit<UploadOptions, 'fileType'>): Promise<FileUploadResult[]>;
    /**
     * 检查文件类型
     */
    validateFileType(fileData: string | Buffer, expectedType: 1 | 2 | 3): boolean;
    /**
     * 获取文件大小
     */
    getFileSize(fileData: string | Buffer): number;
    /**
     * 检查文件大小限制
     */
    checkFileSizeLimit(fileData: string | Buffer, maxSize?: number): boolean;
    /**
     * 从URL下载文件
     */
    downloadFromUrl(url: string): Promise<Buffer>;
    /**
     * 清理临时文件
     */
    cleanupTempFiles(filePaths: string[]): Promise<void>;
}
import type { AxiosInstance } from 'axios';
export type MediaFileType = 1 | 2 | 3 | 4;
export interface MediaUploadResult {
    file_uuid: string;
    file_info: string;
    ttl: number;
}
export interface ChunkedUploadProgress {
    completedParts: number;
    totalParts: number;
    uploadedBytes: number;
    totalBytes: number;
}
export interface ChunkedUploadOptions {
    fileName?: string;
    onProgress?: (progress: ChunkedUploadProgress) => void;
}
export class UploadDailyLimitExceededError extends Error {
    readonly filePath: string;
    readonly fileSize: number;
    constructor(filePath: string, fileSize: number, message: string);
}
export class ChunkedUploader {
    private readonly request;
    constructor(request: AxiosInstance);
    upload(endpointPath: string, filePath: string, fileType: MediaFileType, options?: ChunkedUploadOptions): Promise<MediaUploadResult>;
    private finishPart;
    private completeUpload;
}
/**
 * 消息系统入口文件
 */
export class Contactable {
    bot: Bot;
    guild_id?: string;
    channel_id?: string;
    group_id?: string;
    user_id?: string;
    constructor(bot: Bot);
}
export namespace Friend {
    interface Info {
        id: string;
        user: User.Info;
        name: string;
    }
}
export namespace Group {
    interface Info {
        id: string;
        name: string;
    }
    /** QQ OpenAPI 群基本信息响应 */
    interface ApiInfo {
        group_openid: string;
        group_name: string;
        group_finger_memo: string;
        group_class_text: string;
        group_tags: string[];
        group_member_num: number;
    }
    /** QQ OpenAPI 机器人群内状态响应 */
    interface BotState {
        member_openid: string;
        /** 入群时间（RFC3339 格式） */
        joined_at: string;
        allow_proactive_msg: boolean;
        recv_msg_setting: 'all' | 'only_mention' | 'mention_and_context';
        member_role: 'member' | 'owner' | 'admin';
    }
    /** 群成员禁言操作类型 */
    type MemberMuteOperation = 'add' | 'update' | 'del';
    /** 设置群成员禁言请求项 */
    interface SetMemberMuteState {
        op: MemberMuteOperation;
        member_openid: string;
        /** 禁言到期时间（RFC3339 格式）；解除禁言时可传空字符串 */
        mute_expire_at?: string;
    }
    /** 当前处于禁言状态的群成员 */
    interface MemberMuteState {
        member_openid: string;
        mute_expire_at: string;
        username: string;
        union_openid: string;
    }
    interface MuteScheduleRule {
        task_id: string;
        start_at: string;
        end_at: string;
        enabled: boolean;
    }
    interface MuteRecurringRule {
        task_id: string;
        weekdays: number[];
        start_time: string;
        end_time: string;
        enabled: boolean;
    }
    interface GlobalMuteRule {
        mode: 'none' | 'always' | 'schedule';
        schedule_rules: MuteScheduleRule[];
        recurring_rules: MuteRecurringRule[];
    }
    /** 查询群禁言状态响应 */
    interface RestrictChatSetting {
        global_rule: GlobalMuteRule;
        members: MemberMuteState[];
    }
}
export namespace GroupMember {
    interface Info {
        user: User.Info;
        group_id: string;
    }
}
/**
 * 数据实体类入口文件
 */
import type { MessageElem, Sendable } from "elements";
import type { Dict } from "types";
import type { User } from "entries/user";
import type { ApplicationPlatform } from "receivers/middleware";
export class Message {
    readonly bot: Bot<ReceiverMode, ApplicationPlatform>;
    message_type: Message.Type;
    sub_type: Message.SubType;
    get self_id(): string;
    guild_id?: string;
    channel_id?: string;
    group_id?: string;
    id: string;
    message_id: string;
    sender: Message.Sender;
    user_id: string;
    constructor(bot: Bot<ReceiverMode, ApplicationPlatform>, attrs: Dict);
    readonly raw_message: string;
    readonly source?: {
        message_id: string;
        id: string;
    };
    readonly message: Sendable;
    get [Symbol.unscopables](): {
        bot: boolean;
    };
    toJSON(): {
        [k: string]: any;
    };
}
export namespace Message {
    interface Sender {
        user_id: string;
        user_name: string;
        permissions: User.Permission[];
    }
    type Ret = MessageRet | FileInfo;
    type MessageRet = {
        id: string;
        timestamp: number;
        ext_info?: {
            ref_idx?: string;
            [key: string]: unknown;
        };
    };
    type Audit = {
        message_audit: {
            audit_id: string;
        };
    };
    type FileInfo = {
        file_uuid: string;
        file_info: string;
        ttl: number;
    };
    type Type = 'private' | 'group' | 'guild';
    type SubType = 'direct' | 'friend' | 'temp' | 'normal';
    function parse(this: Bot<ReceiverMode>, payload: Dict): (string | MessageElem[])[];
}
export interface MessageEvent {
    reply(message: Sendable, quote?: boolean): Promise<any>;
}
export class PrivateMessageEvent extends Message implements MessageEvent {
    constructor(bot: Bot, sub_type: Message.SubType, payload: Partial<Message>);
    recall(): Promise<boolean>;
    reply(message: Sendable): Promise<SendResult>;
}
export class MessageAuditEvent {
    bot: Bot;
    is_passed: boolean;
    audit_id: string;
    audit_time: number;
    guild_id: string;
    channel_id: string;
    create_time: number;
    message_id: string;
    constructor(bot: Bot, payload: Partial<MessageAuditEvent>, is_passed?: boolean);
}
export namespace MessageAuditEvent {
    const parse: EventParser;
}
export class GroupMessageEvent extends Message implements MessageEvent {
    group_id: string;
    group_name: string;
    constructor(bot: Bot, payload: Partial<Message>);
    reply(message: Sendable): Promise<SendResult>;
}
export class GuildMessageEvent extends Message implements MessageEvent {
    guild_id: string;
    guild_name: string;
    channel_id: string;
    channel_name: string;
    constructor(bot: Bot, payload: Partial<Message>);
    /**
     * 将该消息设置为公告
     */
    asAnnounce(): Promise<Announce>;
    /**
     * 置顶消息
     */
    pin(): Promise<PinsMessage>;
    /**
     * 撤回消息
     * @param hidetip {boolean} 是否隐藏提示
     */
    recall(hidetip?: boolean): Promise<boolean>;
    /**
     * 回复消息
     * @param message {Sendable} 回复内容
     */
    reply(message: Sendable): Promise<SendResult>;
    /**
     * 消息表态
     * @param type {1|2} 表情类型
     * @param id {`${number}`} 表态表情id
     */
    reaction(type: EmojiType, id: `${number}`): Promise<boolean>;
    /**
     * 删除消息表态
     * @param type {1|2} 表情类型
     * @param id {`${number}`} 表态表情id
     */
    deleteReaction(type: EmojiType, id: `${number}`): Promise<boolean>;
    /**
     * 获取表态用户列表
     * @param type {1|2} 表情类型
     * @param id {`${number}`} 表态表情id
     */
    getReactionMembers(type: EmojiType, id: `${number}`): Promise<{
        user_id: string;
        user_name: string;
        avatar: string;
    }[]>;
}
export namespace MessageEvent {
    const parse: EventParser;
}
export class NoticeEvent {
    bot: Bot;
    notice_type: NoticeEvent.Type;
    sub_type: string;
    guild_id?: string;
    channel_id?: string;
    group_id?: string;
    operator_id?: string;
    event_id?: string;
    notice_id?: string;
    constructor(bot: Bot, payload: Dict);
}
export namespace NoticeEvent {
    type Type = 'friend' | 'group' | 'direct' | 'channel' | 'forum' | 'guild';
}
export class ActionNoticeEvent extends NoticeEvent {
    data: ActionNoticeEvent.ActionData;
    private replied;
    constructor(bot: Bot, payload: Dict);
    /**
     * 回应操作
     * @param code {0|1|2|3|4|5} 结果编码，释义见官网，默认0
     */
    reply(code?: ActionNoticeEvent.ReplyCode): Promise<boolean>;
}
export class FriendActionNoticeEvent extends ActionNoticeEvent {
    operator_id: string;
    notice_type: 'friend';
    constructor(bot: Bot, payload: Dict);
}
export class GroupActionNoticeEvent extends ActionNoticeEvent {
    group_id: string;
    operator_id: string;
    notice_type: 'group';
    constructor(bot: Bot, payload: Dict);
}
export class GuildActionNoticeEvent extends ActionNoticeEvent {
    guild_id: string;
    channel_id: string;
    operator_id: string;
    notice_type: 'guild';
    constructor(bot: Bot, payload: Dict);
}
export namespace ActionNoticeEvent {
    type ReplyCode = 0 | 1 | 2 | 3 | 4 | 5;
    type ActionData = {
        type: number;
        resolved: {
            button_data?: string;
            button_id: string;
            user_id?: string;
            feature_id?: string;
            message_id?: string;
        };
    };
    const parse: EventParser;
}
export class FriendReceiveNoticeEvent extends NoticeEvent {
    user_id: string;
    time: number;
    get actionText(): "开启" | "关闭";
    constructor(bot: Bot, sub_type: 'receive_open' | 'receive_close', payload: Dict);
}
export namespace FriendReceiveNoticeEvent {
    const parse: EventParser;
}
export class FriendChangeNoticeEvent extends NoticeEvent {
    user_id: string;
    time: number;
    get actionText(): "新增" | "减少";
    constructor(bot: Bot, sub_type: 'increase' | 'decrease', payload: Dict);
}
export namespace FriendChangeNoticeEvent {
    const parse: EventParser;
}
export class GroupReceiveNoticeEvent extends NoticeEvent {
    group_id: string;
    operator_id: string;
    time: number;
    get actionText(): "开启" | "关闭";
    constructor(bot: Bot, sub_type: 'receive_open' | 'receive_close', payload: Dict);
}
export namespace GroupReceiveNoticeEvent {
    const parse: EventParser;
}
export class GroupChangeNoticeEvent extends NoticeEvent {
    group_id: string;
    operator_id: string;
    time: number;
    get actionText(): "新增" | "减少";
    constructor(bot: Bot, sub_type: 'increase' | 'decrease', payload: Dict);
}
export namespace GroupChangeNoticeEvent {
    const parse: EventParser;
}
export class GroupMemberChangeNoticeEvent extends NoticeEvent {
    group_id: string;
    user_id: string;
    operator_id?: string;
    time: number;
    notice_type: 'group';
    sub_type: 'member.increase' | 'member.decrease';
    get actionText(): "加入" | "退出";
    constructor(bot: Bot, sub_type: 'member.increase' | 'member.decrease', payload: Dict);
}
export namespace GroupMemberChangeNoticeEvent {
    const parse: EventParser;
}
export class GuildChangeNoticeEvent extends NoticeEvent {
    guild_id: string;
    guild_name: string;
    operator_id: string;
    time: number;
    sub_type: 'increase' | 'update' | 'decrease';
    get actionText(): "新增" | "减少" | "更新";
    constructor(bot: Bot, sub_type: 'increase' | 'decrease' | 'update', payload: Dict);
}
export namespace GuildChangeNoticeEvent {
    const parse: EventParser;
}
export class ChannelChangeNoticeEvent extends NoticeEvent {
    guild_id: string;
    channel_id: string;
    channel_name: string;
    channel_type: number;
    operator_id: string;
    time: number;
    sub_type: ChannelChangeNoticeEvent.SubType;
    get actionText(): "新增" | "减少" | "更新" | "进入" | "离开";
    constructor(bot: Bot, sub_type: ChannelChangeNoticeEvent.SubType, payload: Dict);
}
export namespace ChannelChangeNoticeEvent {
    type SubType = 'increase' | 'update' | 'decrease' | 'enter' | 'exit';
    const parse: EventParser;
}
export class GuildMemberChangeNoticeEvent extends NoticeEvent {
    guild_id: string;
    operator_id: string;
    user_id: string;
    user_name: string;
    is_bot: boolean;
    time: number;
    sub_type: 'member.increase' | 'member.update' | 'member.decrease';
    get actionText(): "加入" | "退出" | "变更";
    constructor(bot: Bot, sub_type: 'member.increase' | 'member.decrease' | 'member.update', payload: Dict);
}
export namespace GuildMemberChangeNoticeEvent {
    const parse: EventParser;
}
export class ForumNoticeEvent extends NoticeEvent {
    guild_id: string;
    channel_id: string;
    author_id: string;
    sub_type: ForumNoticeEvent.SubType;
    constructor(bot: Bot, payload: Dict);
}
export namespace ForumNoticeEvent {
    type SubType = 'thread.create' | 'thread.delete' | 'thread.update' | 'post.create' | 'post.delete' | 'reply.create' | 'reply.delete' | 'audit';
    const parse: EventParser;
}
export class ThreadChangeNoticeEvent extends ForumNoticeEvent {
    thread_id: string;
    title: string;
    content: string;
    time: number;
    get actionText(): "更新" | "创建" | "删除";
    constructor(bot: Bot, sub_type: 'create' | 'update' | 'delete', payload: Dict);
}
export class PostChangeNoticeEvent extends ForumNoticeEvent {
    thread_id: string;
    post_id: string;
    content: string;
    time: number;
    get actionText(): "删除" | "发布";
    constructor(bot: Bot, sub_type: 'create' | 'delete', payload: Dict);
}
export class ReplyChangeNoticeEvent extends ForumNoticeEvent {
    thread_id: string;
    post_id: string;
    reply_id: string;
    content: string;
    time: number;
    get actionText(): "创建" | "删除";
    constructor(bot: Bot, sub_type: 'create' | 'delete', payload: Dict);
}
export class FormAuditNoticeEvent extends ForumNoticeEvent {
    thread_id: string;
    post_id: string;
    reply_id: string;
    type: AuditType;
    /** 审核结果： 0 成功 1 失败 */
    result: 0 | 1;
    message?: string;
    get typeText(): "主题" | "帖子" | "回复";
    constructor(bot: Bot, payload: Dict);
}
export class MessageReactionNoticeEvent extends NoticeEvent {
    user_id: string;
    message_id: string;
    channel_id: string;
    sub_type: 'add' | 'remove';
    guild_id: string;
    emoji: Emoji;
    constructor(bot: Bot, sub_type: 'add' | 'remove', payload: Dict);
}
export namespace MessageReactionNoticeEvent {
    const parse: EventParser;
}
export enum QQEvent {
    DIRECT_MESSAGE_CREATE = "message.private.direct",
    AT_MESSAGE_CREATE = "message.guild",
    MESSAGE_CREATE = "message.guild",
    MESSAGE_REACTION_ADD = "notice.reaction.add",
    MESSAGE_REACTION_REMOVE = "notice.reaction.remove",
    GUILD_CREATE = "notice.guild.increase",
    GUILD_UPDATE = "notice.guild.update",
    GUILD_DELETE = "notice.guild.decrease",
    CHANNEL_CREATE = "notice.channel.increase",
    CHANNEL_UPDATE = "notice.channel.update",
    CHANNEL_DELETE = "notice.channel.decrease",
    AUDIO_OR_LIVE_CHANNEL_MEMBER_ENTER = "notice.channel.enter",
    AUDIO_OR_LIVE_CHANNEL_MEMBER_EXIT = "notice.channel.exit",
    GUILD_MEMBER_ADD = "notice.guild.member.increase",
    GUILD_MEMBER_UPDATE = "notice.guild.member.update",
    GUILD_MEMBER_REMOVE = "notice.guild.member.decrease",
    GROUP_ADD_ROBOT = "notice.group.increase",
    GROUP_DEL_ROBOT = "notice.group.decrease",
    GROUP_MEMBER_ADD = "notice.group.member.increase",
    GROUP_MEMBER_REMOVE = "notice.group.member.decrease",
    GROUP_MSG_REJECT = "notice.group.receive_close",
    GROUP_MSG_RECEIVE = "notice.group.receive_open",
    FRIEND_ADD = "notice.friend.increase",
    FRIEND_DEL = "notice.friend.decrease",
    C2C_MSG_REJECT = "notice.friend.receive_close",
    C2C_MSG_RECEIVE = "notice.friend.receive_open",
    INTERACTION_CREATE = "notice",
    MESSAGE_AUDIT_PASS = "message.audit.pass",
    MESSAGE_AUDIT_REJECT = "message.audit.reject",
    C2C_MESSAGE_CREATE = "message.private.friend",
    GROUP_MESSAGE_CREATE = "message.group",
    GROUP_AT_MESSAGE_CREATE = "message.group",
    FORUM_THREAD_CREATE = "notice.forum.thread.create",
    FORUM_THREAD_UPDATE = "notice.forum.thread.update",
    FORUM_THREAD_DELETE = "notice.forum.thread.delete",
    FORUM_POST_CREATE = "notice.forum.post.create",
    FORUM_POST_DELETE = "notice.forum.post.delete",
    FORUM_REPLY_CREATE = "notice.forum.reply.create",
    FORUM_REPLY_DELETE = "notice.forum.reply.delete",
    FORUM_PUBLISH_AUDIT_RESULT = "notice.forum.audit",
    OPEN_FORUM_THREAD_CREATE = "notice.forum",
    OPEN_FORUM_THREAD_UPDATE = "notice.forum",
    OPEN_FORUM_THREAD_DELETE = "notice.forum",
    OPEN_FORUM_POST_CREATE = "notice.forum",
    OPEN_FORUM_POST_DELETE = "notice.forum",
    OPEN_FORUM_REPLY_CREATE = "notice.forum",
    OPEN_FORUM_REPLY_DELETE = "notice.forum"
}
export type EventParser<T extends keyof EventMap = keyof EventMap> = (this: Bot<ReceiverMode, ApplicationPlatform>, event: T, payload: Dict) => Parameters<EventMap[T]>[0];
export const EventParserMap: Map<string, EventParser>;
export interface EventMap {
    'message'(e: PrivateMessageEvent | GroupMessageEvent | GuildMessageEvent | MessageAuditEvent): void;
    'message.audit'(e: MessageAuditEvent): void;
    'message.audit.pass'(e: MessageAuditEvent): void;
    'message.audit.reject'(e: MessageAuditEvent): void;
    'message.group'(e: GroupMessageEvent): void;
    'message.private'(e: PrivateMessageEvent): void;
    'message.private.friend'(e: PrivateMessageEvent): void;
    'message.private.direct'(e: PrivateMessageEvent): void;
    'message.guild'(e: GuildMessageEvent): void;
    'notice'(e: NoticeEvent): void;
    'notice.friend'(e: FriendActionNoticeEvent | FriendChangeNoticeEvent | FriendReceiveNoticeEvent): void;
    'notice.friend.action'(e: FriendActionNoticeEvent): void;
    'notice.friend.increase'(e: FriendChangeNoticeEvent): void;
    'notice.friend.decrease'(e: FriendChangeNoticeEvent): void;
    'notice.friend.receive_close'(e: FriendReceiveNoticeEvent): void;
    'notice.friend.receive_open'(e: FriendReceiveNoticeEvent): void;
    'notice.reaction.add'(e: MessageReactionNoticeEvent): void;
    'notice.reaction.remove'(e: MessageReactionNoticeEvent): void;
    'notice.group'(e: ActionNoticeEvent | GroupChangeNoticeEvent | GroupMemberChangeNoticeEvent | GroupReceiveNoticeEvent): void;
    'notice.group.increase'(e: GroupChangeNoticeEvent): void;
    'notice.group.decrease'(e: GroupChangeNoticeEvent): void;
    'notice.group.member'(e: GroupMemberChangeNoticeEvent): void;
    'notice.group.member.increase'(e: GroupMemberChangeNoticeEvent): void;
    'notice.group.member.decrease'(e: GroupMemberChangeNoticeEvent): void;
    'notice.group.receive_close'(e: GroupReceiveNoticeEvent): void;
    'notice.group.receive_open'(e: GroupReceiveNoticeEvent): void;
    'notice.group.action'(e: GroupActionNoticeEvent): void;
    'notice.guild'(e: ActionNoticeEvent | GuildChangeNoticeEvent | GuildMemberChangeNoticeEvent): void;
    'notice.guild.action'(e: GuildActionNoticeEvent): void;
    'notice.guild.increase'(e: GuildChangeNoticeEvent): void;
    'notice.guild.update'(e: GuildChangeNoticeEvent): void;
    'notice.guild.decrease'(e: GuildChangeNoticeEvent): void;
    'notice.channel'(e: ChannelChangeNoticeEvent): void;
    'notice.channel.enter'(e: ChannelChangeNoticeEvent): void;
    'notice.channel.exit'(e: ChannelChangeNoticeEvent): void;
    'notice.channel.increase'(e: ChannelChangeNoticeEvent): void;
    'notice.channel.update'(e: ChannelChangeNoticeEvent): void;
    'notice.channel.decrease'(e: ChannelChangeNoticeEvent): void;
    'notice.guild.member'(e: GuildMemberChangeNoticeEvent): void;
    'notice.guild.member.increase'(e: GuildMemberChangeNoticeEvent): void;
    'notice.guild.member.update'(e: GuildMemberChangeNoticeEvent): void;
    'notice.guild.member.decrease'(e: GuildMemberChangeNoticeEvent): void;
    'notice.forum'(e: ThreadChangeNoticeEvent | FormAuditNoticeEvent | PostChangeNoticeEvent | ReplyChangeNoticeEvent | ForumNoticeEvent): void;
    'notice.forum.thread'(e: ThreadChangeNoticeEvent): void;
    'notice.forum.thread.create'(e: ThreadChangeNoticeEvent): void;
    'notice.forum.thread.update'(e: ThreadChangeNoticeEvent): void;
    'notice.forum.thread.delete'(e: ThreadChangeNoticeEvent): void;
    'notice.forum.audit'(e: FormAuditNoticeEvent): void;
    'notice.forum.post'(e: PostChangeNoticeEvent): void;
    'notice.forum.post.create'(e: PostChangeNoticeEvent): void;
    'notice.forum.post.delete'(e: PostChangeNoticeEvent): void;
    'notice.forum.reply'(e: ReplyChangeNoticeEvent): void;
    'notice.forum.reply.create'(e: ReplyChangeNoticeEvent): void;
    'notice.forum.reply.delete'(e: ReplyChangeNoticeEvent): void;
}
import type { Dict, LogLevel, DataPacket } from "types";
import type { ApplicationPlatform } from "receivers/middleware";
export class Client<T extends ReceiverMode, M extends ApplicationPlatform = ApplicationPlatform> extends EventEmitter {
    readonly config: Client.Config<T, M>;
    readonly request: AxiosInstance;
    readonly sessionManager: Session<T, M>;
    readonly logger: log4js.Logger;
    self_id: string;
    nickname: string;
    status: number;
    ws: WebSocket;
    get receiver(): ResolveReceiver<T, M>;
    constructor(config: Client.Config<T, M>);
    removeAt(payload: Dict): void;
    private completeGroupAtMention;
    processPayload(event_id: string, event: string, payload: Dict): Dict | null;
    dispatchEvent(event: string, wsRes: DataPacket): void;
    em(event: string, payload: Dict): void;
    private setupInterceptors;
}
export interface Client<T extends ReceiverMode = ReceiverMode, M extends ApplicationPlatform = ApplicationPlatform> {
    on<E extends keyof EventMap>(event: E, callback: EventMap[E]): this;
    on<S extends string | symbol>(event: S & Exclude<string | symbol, keyof EventMap>, callback: (...args: any[]) => void): this;
    once<E extends keyof EventMap>(event: E, callback: EventMap[E]): this;
    once<S extends string | symbol>(event: S & Exclude<string | symbol, keyof EventMap>, callback: (...args: any[]) => void): this;
    off<E extends keyof EventMap>(event: E, callback?: EventMap[E]): this;
    off<S extends string | symbol>(event: S & Exclude<string | symbol, keyof EventMap>, callback?: (...args: any[]) => void): this;
    emit<E extends keyof EventMap>(event: E, ...args: Parameters<EventMap[E]>): boolean;
    emit<S extends string | symbol>(event: S & Exclude<string | symbol, keyof EventMap>, ...args: any[]): boolean;
    addListener<E extends keyof EventMap>(event: E, callback: EventMap[E]): this;
    addListener<S extends string | symbol>(event: S & Exclude<string | symbol, keyof EventMap>, callback: (...args: any[]) => void): this;
    addListenerOnce<E extends keyof EventMap>(event: E, callback: EventMap[E]): this;
    addListenerOnce<S extends string | symbol>(event: S & Exclude<string | symbol, keyof EventMap>, callback: (...args: any[]) => void): this;
    removeListener<E extends keyof EventMap>(event: E, callback?: EventMap[E]): this;
    removeListener<S extends string | symbol>(event: S & Exclude<string | symbol, keyof EventMap>, callback?: (...args: any[]) => void): this;
    removeAllListeners<E extends keyof EventMap>(event: E): this;
    removeAllListeners<S extends string | symbol>(event: S & Exclude<string | symbol, keyof EventMap>): this;
}
export namespace Client {
    interface Token {
        access_token: string;
        expires_in: number;
        cache?: string;
    }
    type Config<T extends ReceiverMode = ReceiverMode, M extends ApplicationPlatform = ApplicationPlatform> = {
        appid: string;
        secret: string;
        sandbox?: boolean;
        timeout?: number;
        maxRetry?: number;
        dataDir?: string;
        /** Whether to remove the first @ mention */
        removeAt?: boolean;
        delay?: Dict<number>;
        intents?: Intent[];
        logLevel?: LogLevel;
        mode: T;
    } & ReceiveModeConfig<M>[T];
}
/**
 * 频道服务类 - 负责所有频道相关的API操作
 */
export class GuildService {
    private request;
    constructor(request: AxiosInstance);
    /**
     * 获取频道列表
     */
    getList(): Promise<Guild.ApiInfo[]>;
    /**
     * 获取频道信息
     */
    getInfo(guildId: string): Promise<Guild.ApiInfo>;
    /**
     * 频道禁言
     */
    mute(guildId: string, seconds: number, endTime?: number): Promise<boolean>;
    /**
     * 取消频道禁言
     */
    unmute(guildId: string): Promise<boolean>;
    /**
     * 获取频道角色列表
     */
    getRoles(guildId: string): Promise<Guild.Role[]>;
    /**
     * 创建频道角色
     */
    createRole(guildId: string, role: RoleCreateParam): Promise<Guild.Role>;
    /**
     * 更新频道角色
     */
    updateRole(guildId: string, roleId: string, updateInfo: RoleUpdateParam): Promise<Guild.Role>;
    /**
     * 删除频道角色
     */
    deleteRole(roleId: string): Promise<boolean>;
    /**
     * 获取频道可访问API类别
     */
    getAccessApis(guildId: string): Promise<ApiPermissionDemand[]>;
    /**
     * 申请频道API权限
     */
    applyAccess(guildId: string, channelId: string, apiInfo: ApiBaseInfo, desc?: string): Promise<ApiPermissionDemand>;
    /**
     * 私有方法：获取频道列表的实现
     */
    private _getGuildList;
}
/**
 * 子频道服务类 - 负责所有子频道相关的API操作
 */
export class ChannelService {
    private request;
    constructor(request: AxiosInstance);
    /**
     * 获取子频道列表
     */
    getList(guildId: string): Promise<Channel.ApiInfo[]>;
    /**
     * 获取子频道信息
     */
    getInfo(channelId: string): Promise<Channel.ApiInfo>;
    /**
     * 创建子频道
     */
    create(guildId: string, channelInfo: Omit<Channel.Info, 'id'>): Promise<Channel.Info>;
    /**
     * 修改子频道
     */
    update(channelId: string, updateInfo: ChannelUpdateInfo): Promise<Channel.Info>;
    /**
     * 删除子频道
     */
    delete(channelId: string): Promise<boolean>;
    /**
     * 获取频道置顶消息id列表
     */
    getPins(channelId: string): Promise<string[]>;
    /**
     * 置顶频道消息
     */
    pinMessage(channelId: string, messageId: string): Promise<PinsMessage>;
    /**
     * 取消置顶频道消息
     */
    unpinMessage(channelId: string, messageId: string): Promise<boolean>;
}
/**
 * 消息服务类 - 负责所有消息相关的API操作
 */
export interface SendOptions {
    quote?: boolean;
    timeout?: number;
    retries?: number;
}
export interface SendResult {
    id: string;
    timestamp: number;
    ext_info?: {
        ref_idx?: string;
        [key: string]: unknown;
    };
    [key: string]: any;
}
export class MessageService {
    private request;
    private appid;
    constructor(request: AxiosInstance, appid: string);
    /**
     * 获取子频道消息
     */
    getGuildMessage(channelId: string, messageId: string): Promise<GuildMessageEvent>;
    /**
     * 发送频道消息
     */
    sendGuildMessage(channelId: string, message: Sendable, source?: Quotable, options?: SendOptions): Promise<SendResult>;
    /**
     * 撤回频道消息
     */
    recallGuildMessage(channelId: string, messageId: string, hideWarning?: boolean): Promise<boolean>;
    /**
     * 创建频道私信会话
     */
    createDirectSession(guildId: string, userId: string): Promise<DMS>;
    /**
     * 发送频道私信
     */
    sendDirectMessage(guildId: string, message: Sendable, source?: Quotable, options?: SendOptions): Promise<SendResult>;
    /**
     * 获取频道私信消息
     */
    getDirectMessage(guildId: string, messageId: string): Promise<PrivateMessageEvent>;
    /**
     * 撤回频道私信
     */
    recallDirectMessage(guildId: string, messageId: string, hidetip?: boolean): Promise<boolean>;
    /**
     * 发送私聊消息
     */
    sendPrivateMessage(userId: string, message: Sendable, source?: Quotable, options?: SendOptions): Promise<SendResult>;
    /**
     * 撤回私聊消息
     */
    recallPrivateMessage(userId: string, messageId: string): Promise<boolean>;
    /**
     * 发送群消息
     */
    sendGroupMessage(groupId: string, message: Sendable, source?: Quotable, options?: SendOptions): Promise<SendResult>;
    /**
     * 撤回群消息
     */
    recallGroupMessage(groupId: string, messageId: string): Promise<boolean>;
    /**
     * 核心发送消息方法
     */
    private sendMessage;
    /**
     * 上传文件
     */
    private uploadFile;
    /**
     * 发送普通消息
     */
    private sendRegularMessage;
    /**
     * 检查是否为审核结果
     */
    private isAuditResult;
    /**
     * 批量发送消息
     */
    sendBatch(endpointPath: string, messages: Sendable[], options?: SendOptions): Promise<SendResult[]>;
    /**
     * 工具方法：延迟
     */
    private delay;
}
/**
 * 成员服务类 - 负责所有成员相关的API操作
 */
export class MemberService {
    private request;
    constructor(request: AxiosInstance);
    /**
     * 获取频道成员列表
     */
    getGuildMemberList(guildId: string): Promise<GuildMember.ApiInfo[]>;
    /**
     * 获取频道成员信息
     */
    getGuildMemberInfo(guildId: string, memberId: string): Promise<GuildMember.ApiInfo>;
    /**
     * 批量禁言频道成员
     */
    muteMembers(guildId: string, memberIds: string[], seconds: number, endTime?: number): Promise<boolean>;
    /**
     * 批量取消频道成员禁言
     */
    unmuteMembers(guildId: string, memberIds: string[]): Promise<boolean>;
    /**
     * 添加频道成员角色
     */
    addMemberRole(guildId: string, channelId: string, memberId: string, roleId: string): Promise<boolean>;
    /**
     * 移除频道成员角色
     */
    removeMemberRole(guildId: string, channelId: string, memberId: string, roleId: string): Promise<boolean>;
    /**
     * 踢出频道成员
     */
    kickMember(guildId: string, memberId: string, clean?: -1 | 0 | 3 | 7 | 15 | 30, blacklist?: boolean): Promise<boolean>;
    /**
     * 私有方法：获取频道成员列表的实现
     */
    private _getGuildMemberList;
}
/**
 * 权限服务类 - 负责所有权限相关的API操作
 */
export class PermissionService {
    private request;
    constructor(request: AxiosInstance);
    /**
     * 获取频道角色权限信息
     */
    getChannelRolePermission(channelId: string, roleId: string): Promise<ChannelRolePermissions>;
    /**
     * 更新频道角色权限
     */
    updateChannelRolePermission(channelId: string, roleId: string, permission: UpdatePermissionParams): Promise<boolean>;
    /**
     * 获取频道用户权限
     */
    getChannelMemberPermission(channelId: string, memberId: string): Promise<ChannelMemberPermissions>;
    /**
     * 更新频道用户权限
     */
    updateChannelMemberPermission(channelId: string, memberId: string, permission: UpdatePermissionParams): Promise<boolean>;
    /**
     * 设置频道公告
     */
    setChannelAnnounce(guildId: string, channelId: string, messageId: string): Promise<Announce>;
}
/**
 * 表态服务类 - 负责所有表态相关的API操作
 */
export class ReactionService {
    private request;
    constructor(request: AxiosInstance);
    /**
     * 对频道消息进行表态
     */
    addGuildMessageReaction(channelId: string, messageId: string, type: EmojiType, id: `${number}`): Promise<boolean>;
    /**
     * 删除频道消息表态
     */
    deleteGuildMessageReaction(channelId: string, messageId: string, type: EmojiType, id: `${number}`): Promise<boolean>;
    /**
     * 获取表态用户列表
     */
    getGuildMessageReactionMembers(channelId: string, messageId: string, type: EmojiType, id: `${number}`): Promise<User.Info[]>;
    /**
     * 私有方法：获取表态用户列表的实现
     */
    private _getGuildMessageReactionMembers;
}
/**
 * 日程服务类 - 负责所有日程相关的API操作
 */
export class ScheduleService {
    private request;
    constructor(request: AxiosInstance);
    /**
     * 获取频道日程列表
     */
    getChannelSchedules(channelId: string, since?: number): Promise<ScheduleInfo[]>;
    /**
     * 获取频道日程详情
     */
    getChannelSchedule(channelId: string, scheduleId: string): Promise<ScheduleInfo>;
    /**
     * 创建频道日程
     */
    createChannelSchedule(channelId: string, name: string, description: string, startTimestamp: number, endTimestamp: number, jumpChannelId?: string, remindType?: RemindType): Promise<ScheduleInfo>;
    /**
     * 修改频道日程
     */
    updateChannelSchedule(channelId: string, scheduleId: string, name: string, description: string, startTimestamp: number, endTimestamp: number, jumpChannelId?: string, remindType?: RemindType): Promise<ScheduleInfo>;
    /**
     * 删除日程
     */
    deleteChannelSchedule(channelId: string, scheduleId: string): Promise<any>;
}
/**
 * 帖子服务类 - 负责所有帖子相关的API操作
 */
export class ThreadService {
    private request;
    constructor(request: AxiosInstance);
    /**
     * 获取频道帖子列表
     */
    getChannelThreads(channelId: string): Promise<Thread[]>;
    /**
     * 获取频道帖子详情
     */
    getChannelThreadInfo(channelId: string, threadId: string): Promise<ThreadInfo>;
    /**
     * 创建频道帖子
     */
    publishThread(channelId: string, title: string, content: string, format?: 1 | 2 | 3 | 4): Promise<ThreadInfo>;
    /**
     * 删除频道帖子
     */
    deleteThread(channelId: string, threadId: string): Promise<boolean>;
}
/**
 * 音频服务类 - 负责所有音频相关的API操作
 */
export class AudioService {
    private request;
    constructor(request: AxiosInstance);
    /**
     * 音频控制
     */
    controlChannelAudio(channelId: string, audioControl: AudioControl): Promise<boolean>;
    /**
     * 上麦
     */
    setOnlineMic(channelId: string): Promise<boolean>;
    /**
     * 下麦
     */
    setOfflineMic(channelId: string): Promise<boolean>;
}
/**
 * 机器人服务类 - 负责机器人基础信息和操作相关的API
 */
export class BotService {
    private request;
    constructor(request: AxiosInstance);
    /**
     * 获取机器人信息
     */
    getSelfInfo(): Promise<Bot.Info>;
    /**
     * 回应操作
     */
    replyAction(actionId: string, code?: ActionNoticeEvent.ReplyCode): Promise<boolean>;
}
/**
 * 群服务类 - 负责群基本信息相关 API
 */
export class GroupService {
    private request;
    constructor(request: AxiosInstance);
    /**
     * 获取群基本信息
     */
    getInfo(groupOpenid: string): Promise<Group.ApiInfo>;
    /**
     * 获取机器人群内状态
     */
    getBotState(groupOpenid: string): Promise<Group.BotState>;
    /**
     * 查询群禁言状态
     */
    getRestrictChatSetting(groupOpenid: string): Promise<Group.RestrictChatSetting>;
    /**
     * 设置群成员禁言，单次最多操作 10 个成员
     */
    setMemberMuteState(groupOpenid: string, members: Group.SetMemberMuteState[]): Promise<boolean>;
}
/**
 * 服务模块导出
 * 集中导出所有API服务类
 */
export type ApiResponse<T> = {
    success: boolean;
    data?: T;
    message?: string;
    error?: any;
};
export class Bot<T extends ReceiverMode = ReceiverMode, M extends ApplicationPlatform = ApplicationPlatform> extends Client<T, M> {
    readonly messageBuilder: MessageBuilder;
    readonly messageService: MessageService;
    readonly fileProcessor: FileProcessor;
    readonly guildService: GuildService;
    readonly channelService: ChannelService;
    readonly memberService: MemberService;
    readonly permissionService: PermissionService;
    readonly reactionService: ReactionService;
    readonly scheduleService: ScheduleService;
    readonly threadService: ThreadService;
    readonly audioService: AudioService;
    readonly botService: BotService;
    readonly groupService: GroupService;
    constructor(config: Bot.Config<T, M>);
    get middleware(): Middleware<M>;
    /**
     * 获取机器人信息
     */
    getSelfInfo(): Promise<Bot.Info>;
    /**
     * 获取频道角色权限信息
     * @param channel_id 频道id
     * @param role_id 角色id
     */
    getChannelPermissionOfRole(channel_id: string, role_id: string): Promise<ChannelRolePermissions>;
    /**
     * 设置频道公告
     * @param guild_id
     * @param channel_id
     * @param message_id
     */
    setChannelAnnounce(guild_id: string, channel_id: string, message_id: string): Promise<Announce>;
    /**
     * 更新频道角色权限
     * @param channel_id
     * @param role_id
     * @param permission
     */
    updateChannelPermissionOfRole(channel_id: string, role_id: string, permission: UpdatePermissionParams): Promise<boolean>;
    /**
     * 获取频道用户权限
     * @param channel_id
     * @param member_id
     */
    getChannelMemberPermission(channel_id: string, member_id: string): Promise<ChannelMemberPermissions>;
    /**
     * 更新频道用户权限
     * @param channel_id
     * @param member_id
     * @param permission
     */
    updateChannelMemberPermission(channel_id: string, member_id: string, permission: UpdatePermissionParams): Promise<boolean>;
    /**
     * 获取频道置顶消息id列表
     * @param channel_id
     */
    getChannelPins(channel_id: string): Promise<string[]>;
    /**
     * 置顶频道消息
     * @param channel_id
     * @param message_id
     */
    pinChannelMessage(channel_id: string, message_id: string): Promise<PinsMessage>;
    /**
     * 取消置顶频道消息
     * @param channel_id
     * @param message_id
     */
    unPinChannelMessage(channel_id: string, message_id: string): Promise<boolean>;
    /**
     * 创建子频道
     * @param guild_id
     * @param channelInfo
     */
    createChannel(guild_id: string, channelInfo: Omit<Channel.Info, 'id'>): Promise<Channel.Info>;
    /**
     * 修改子频道
     * @param channel_id
     * @param updateInfo
     */
    updateChannel(channel_id: string, updateInfo: ChannelUpdateInfo): Promise<Channel.Info>;
    /**
     * 删除子频道
     * @param channel_id
     */
    deleteChannel(channel_id: string): Promise<boolean>;
    /**
     * 获取频道角色列表
     * @param guild_id
     */
    getGuildRoles(guild_id: string): Promise<Guild.Role[]>;
    /**
     * 创建频道角色
     * @param guild_id
     * @param role
     */
    creatGuildRole(guild_id: string, role: RoleCreateParam): Promise<Guild.Role>;
    /**
     * 修改频道角色
     * @param guild_id
     * @param role_id
     * @param updateInfo
     */
    updateGuildRole(guild_id: string, role_id: string, updateInfo: RoleUpdateParam): Promise<Guild.Role>;
    /**
     * 删除频道角色
     * @param role_id
     */
    deleteGuildRole(role_id: string): Promise<boolean>;
    /**
     * 获取频道可访问API类别
     * @param guild_id
     */
    getGuildAccessApis(guild_id: string): Promise<ApiPermissionDemand[]>;
    /**
     * 申请频道API
     * @param guild_id
     * @param channel_id
     * @param apiInfo
     * @param desc
     */
    applyGuildAccess(guild_id: string, channel_id: string, apiInfo: ApiBaseInfo, desc?: string): Promise<ApiPermissionDemand>;
    /**
     * 取消频道禁言
     * @param guild_id
     */
    unMuteGuild(guild_id: string): Promise<boolean>;
    /**
     * 频道禁言
     * @param guild_id
     * @param seconds
     * @param end_time
     */
    muteGuild(guild_id: string, seconds: number, end_time?: number): Promise<boolean>;
    /**
     * 批量取消频道成员禁言
     * @param guild_id
     * @param member_ids
     */
    unMuteGuildMembers(guild_id: string, member_ids: string[]): Promise<boolean>;
    /**
     * 批量禁言频道成员
     * @param guild_id
     * @param member_ids
     * @param seconds
     * @param end_time
     */
    muteGuildMembers(guild_id: string, member_ids: string[], seconds: number, end_time?: number): Promise<boolean>;
    addGuildMemberRoles(guild_id: string, channel_id: string, member_id: string, role_id: string): Promise<boolean>;
    /**
     * 移除频道成员角色
     * @param guild_id
     * @param channel_id
     * @param member_id
     * @param role_id
     */
    removeGuildMemberRoles(guild_id: string, channel_id: string, member_id: string, role_id: string): Promise<boolean>;
    /**
     * 踢出频道成员
     * @param guild_id
     * @param member_id
     * @param clean
     * @param blacklist
     */
    kickGuildMember(guild_id: string, member_id: string, clean?: -1 | 0 | 3 | 7 | 15 | 30, blacklist?: boolean): Promise<boolean>;
    /**
     * 取消频道成员禁言
     * @param guild_id
     * @param member_id
     */
    unMuteGuildMember(guild_id: string, member_id: string): Promise<boolean>;
    /**
     * 禁言频道成员
     * @param guild_id
     * @param member_id
     * @param seconds
     * @param end_time
     */
    muteGuildMember(guild_id: string, member_id: string, seconds: number, end_time?: number): Promise<boolean>;
    /**
     * 获取频道列表
     */
    getGuildList(): Promise<Guild.ApiInfo[]>;
    /**
     * 获取频道信息
     * @param guild_id
     */
    getGuildInfo(guild_id: string): Promise<Guild.ApiInfo>;
    /**
     * 获取子频道消息
     * @param channel_id {string} 子频道id
     * @param message_id {string} 消息id
     */
    getGuildMessage(channel_id: string, message_id: string): Promise<GuildMessageEvent>;
    /**
     * 获取频道成员列表
     * @param guild_id
     */
    getGuildMemberList(guild_id: string): Promise<GuildMember.ApiInfo[]>;
    /**
     * 获取频道成员信息
     * @param guild_id
     * @param member_id
     */
    getGuildMemberInfo(guild_id: string, member_id: string): Promise<GuildMember.ApiInfo>;
    /**
     * 获取群成员列表
     * @param group_id
     */
    getGroupMemberList(group_id: string): Promise<void>;
    /**
     * 获取群基本信息
     * @param group_id 群 OpenID
     */
    getGroupInfo(group_id: string): Promise<Group.ApiInfo>;
    /**
     * 获取机器人群内状态
     * @param group_id 群 OpenID
     */
    getGroupBotState(group_id: string): Promise<Group.BotState>;
    /**
     * 查询群禁言状态
     * @param group_id 群 OpenID
     */
    getGroupRestrictChatSetting(group_id: string): Promise<Group.RestrictChatSetting>;
    /**
     * 设置群成员禁言
     * @param group_id 群 OpenID
     * @param members 群成员禁言操作列表，单次最多 10 个
     */
    setGroupMemberMuteState(group_id: string, members: Group.SetMemberMuteState[]): Promise<boolean>;
    /**
     * 获取好友列表
     */
    getFriendList(): Promise<void>;
    /**
     * 获取好友信息
     * @param friend_id
     */
    getFriendInfo(friend_id: string): Promise<void>;
    /**
     * 发送私聊信息
     * @param user_id
     * @param message
     * @param source
     */
    sendPrivateMessage(user_id: string, message: Sendable, source?: Quotable): Promise<SendResult>;
    /**
     * 撤回私聊消息
     * @param user_id
     * @param message_id
     */
    recallPrivateMessage(user_id: string, message_id: string): Promise<boolean>;
    /**
     * 发送群消息
     * @param group_id
     * @param message
     * @param source
     */
    sendGroupMessage(group_id: string, message: Sendable, source?: Quotable): Promise<SendResult>;
    /**
     * 撤回群消息
     * @param group_id
     * @param message_id
     */
    recallGroupMessage(group_id: string, message_id: string): Promise<boolean>;
    /**
     * 获取子频道列表
     */
    getChannelList(guild_id: string): Promise<Channel.ApiInfo[]>;
    /**
     * 获取子频道信息
     * @param channel_id
     */
    getChannelInfo(channel_id: string): Promise<Channel.ApiInfo>;
    /**
     * 创建私信会话
     * @param guild_id
     * @param user_id
     */
    createDirectSession(guild_id: string, user_id: string): Promise<DMS>;
    /**
     * 发送频道私信
     * @param guild_id
     * @param message
     * @param source
     */
    sendDirectMessage(guild_id: string, message: Sendable, source?: Quotable): Promise<SendResult>;
    /**
     * 获取频道私信
     * @param guild_id
     * @param message_id
     */
    getDirectMessage(guild_id: string, message_id: string): Promise<import("events").PrivateMessageEvent>;
    /**
     * 撤回频道私信
     * @param guild_id
     * @param message_id
     * @param hidetip
     */
    recallDirectMessage(guild_id: string, message_id: string, hidetip?: boolean): Promise<boolean>;
    /**
     * 发送频道消息
     * @param channel_id
     * @param message
     * @param source
     */
    sendGuildMessage(channel_id: string, message: Sendable, source?: Quotable): Promise<SendResult>;
    /**
     * 撤回频道消息
     * @param channel_id
     * @param message_id
     * @param hidetip
     */
    recallGuildMessage(channel_id: string, message_id: string, hidetip?: boolean): Promise<boolean>;
    /**
     * 添加频道消息表态
     * @param channel_id {string} 子频道id
     * @param message_id {string} 消息id
     * @param type {0|1} 表情类型
     * @param id {`${number}`} 表情id
     */
    addGuildMessageReaction(channel_id: string, message_id: string, type: EmojiType, id: `${number}`): Promise<boolean>;
    /**
     * 删除频道消息表态
     * @param channel_id {string} 子频道id
     * @param message_id {string} 消息id
     * @param type {EmojiType} 表情类型
     * @param id {`${number}`} 表情id
     */
    deleteGuildMessageReaction(channel_id: string, message_id: string, type: EmojiType, id: `${number}`): Promise<boolean>;
    /**
     * 获取表态用户列表
     * @param channel_id {string} 子频道id
     * @param message_id {string} 消息id
     * @param type {0|1} 表情类型
     * @param id {`${number}`} 表情id
     */
    getGuildMessageReactionMembers(channel_id: string, message_id: string, type: EmojiType, id: `${number}`): Promise<{
        user_id: string;
        user_name: string;
        avatar: string;
    }[]>;
    /** 获取频道日程
     * @param channel_id {string}
     * @param since {number}
     */
    getChannelSchedules(channel_id: string, since?: number): Promise<ScheduleInfo[]>;
    /**
     * 获取日程详情
     * @param channel_id
     * @param schedule_id
     */
    getChannelScheduleInfo(channel_id: string, schedule_id: string): Promise<ScheduleInfo>;
    /**
     * 创建日程
     * @param channel_id
     * @param schedule
     */
    createChannelSchedule(channel_id: string, schedule: Exclude<ScheduleInfo, 'id'>): Promise<ScheduleInfo>;
    /**
     * 修改日程
     * @param channel_id
     * @param schedule_id
     * @param schedule
     */
    updateChannelSchedule(channel_id: string, schedule_id: string, schedule: Exclude<ScheduleInfo, 'id'>): Promise<any>;
    /**
     * 删除日程
     * @param channel_id
     * @param schedule_id
     */
    deleteChannelSchedule(channel_id: string, schedule_id: string): Promise<any>;
    /**
     * 音频控制
     * @param channel_id
     * @param audio_control
     */
    controlChannelAudio(channel_id: string, audio_control: AudioControl): Promise<boolean>;
    /**
     * 上麦
     * @param channel_id
     */
    setOnlineMic(channel_id: string): Promise<boolean>;
    /**
     * 下麦
     * @param channel_id
     */
    setOfflineMic(channel_id: string): Promise<boolean>;
    /**
     * 获取频道帖子列表
     * @param channel_id
     */
    getChannelThreads(channel_id: string): Promise<Thread[]>;
    /**
     * 获取频道帖子详情
     * @param channel_id
     * @param thread_id
     */
    getChannelThreadInfo(channel_id: string, thread_id: string): Promise<any>;
    /**
     * 创建频道帖子
     * @param channel_id
     * @param title
     * @param content
     * @param format {1|2|3|4}
     */
    publishThread(channel_id: string, title: string, content: string, format?: 1 | 2 | 3 | 4): Promise<ThreadInfo>;
    /**
     * 删除频道帖子
     * @param channel_id
     * @param thread_id
     */
    deleteThread(channel_id: string, thread_id: string): Promise<boolean>;
    /**
     * 回应操作
     * @param action_id {string} 操作id
     * @param code {number}
     */
    replyAction(action_id: string, code?: ActionNoticeEvent.ReplyCode): Promise<boolean>;
    start(): Promise<this>;
    stop(): Promise<void>;
}
export namespace Bot {
    interface Info {
        id: string;
        username: string;
        avatar: string;
        union_openid?: string;
        union_user_account?: string;
    }
    type Config<T extends ReceiverMode, M extends ApplicationPlatform = ApplicationPlatform> = {} & Client.Config<T, M>;
}
export function defineConfig<T extends ReceiverMode, M extends ApplicationPlatform = ApplicationPlatform>(config: Bot.Config<T, M>): Bot.Config<T, M>;
export function createBot<T extends ReceiverMode, M extends ApplicationPlatform = ApplicationPlatform>(config: Bot.Config<T, M>): Bot<T, M>;
