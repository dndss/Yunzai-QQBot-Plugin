"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Client = void 0;
const events_1 = require("events");
const axios_1 = __importDefault(require("axios"));
const formdata_node_1 = require("formdata-node");
const log4js = __importStar(require("log4js"));
const session_1 = require("./core/session");
const events_2 = require("./events");
class Client extends events_1.EventEmitter {
    get receiver() {
        return this.sessionManager.receiver;
    }
    constructor(config) {
        super();
        this.config = config;
        this.request = axios_1.default.create({
            baseURL: config.sandbox ? 'https://sandbox.api.sgroup.qq.com' : 'https://api.sgroup.qq.com',
            timeout: config.timeout ?? 5000,
            headers: {
                'User-Agent': 'BotNodeSDK/0.0.1'
            }
        });
        this.logger = log4js.getLogger(`[QQBot:${config.appid}]`);
        this.sessionManager = new session_1.Session(this);
        this.logger.level = config.logLevel ?? 'info';
        this.setupInterceptors();
    }
    removeAt(payload) {
        if (this.config.removeAt === false)
            return;
        if (typeof payload.content !== 'string' || !Array.isArray(payload.mentions))
            return;
        const mention = payload.mentions.find((item) => item?.is_you === true && item?.scope === 'single');
        const id = mention?.id || mention?.member_openid || mention?.user_openid;
        if (!id)
            return;
        const escapedId = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        payload.content = payload.content
            .replace(new RegExp(`<@!?${escapedId}>\\s*`), '')
            .trimStart();
    }
    completeGroupAtMention(event, payload) {
        if (event !== 'GROUP_AT_MESSAGE_CREATE' || !this.self_id)
            return;
        const mentions = Array.isArray(payload.mentions) ? payload.mentions : [];
        const hasSelfMention = mentions.some((mention) => mention?.is_you === true && mention?.scope === 'single');
        if (hasSelfMention)
            return;
        const selfId = String(this.self_id);
        payload.mentions = [{
                bot: true,
                id: selfId,
                member_openid: selfId,
                is_you: true,
                scope: 'single',
                ...(this.nickname ? { username: this.nickname } : {})
            }, ...mentions];
        const content = typeof payload.content === 'string' ? payload.content : '';
        const escapedId = selfId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!new RegExp(`<@!?${escapedId}>`).test(content)) {
            payload.content = `<@${selfId}>${content}`;
        }
    }
    processPayload(event_id, event, payload) {
        const [post_type, ...sub_type] = event.split('.');
        const result = {
            event_id,
            post_type,
            [`${post_type}_type`]: sub_type.join('.'),
            ...payload
        };
        const parser = events_2.EventParserMap.get(event);
        if (!parser) {
            this.logger.warn('Unhandled event:', event);
            return result;
        }
        return parser.call(this, event, result);
    }
    dispatchEvent(event, wsRes) {
        this.logger.debug(event, wsRes);
        const { d: payload, id: event_id = '' } = wsRes;
        if (!payload || !event)
            return;
        this.completeGroupAtMention(event, payload);
        const transformEvent = events_2.QQEvent[event] ?? 'system';
        try {
            const result = this.processPayload(event_id, transformEvent, payload);
            if (!result) {
                this.logger.debug('Failed to parse event:', wsRes);
                return;
            }
            this.em(transformEvent, result);
        }
        catch (error) {
            this.logger.debug('Failed to parse event:', wsRes);
        }
    }
    em(event, payload) {
        const eventNames = event.split('.');
        const [post_type, detail_type, ...sub_type] = eventNames;
        Object.assign(payload, {
            post_type,
            [`${post_type}_type`]: detail_type,
            sub_type: sub_type.join('.'),
            ...payload
        });
        let prefix = '';
        const eventNamesCopy = [...eventNames];
        while (eventNamesCopy.length) {
            const eventName = eventNamesCopy.shift();
            const fullEventName = prefix ? `${prefix}.${eventName}` : eventName;
            this.emit(fullEventName, payload);
            prefix = fullEventName;
        }
    }
    setupInterceptors() {
        this.request.interceptors.request.use((config) => {
            config.headers.Authorization = `QQBot ${this.sessionManager.access_token}`;
            config.headers['X-Union-Appid'] = this.config.appid;
            // Handle REST parameters
            if (config.rest) {
                const restObj = config.rest;
                delete config.rest;
                Object.entries(restObj).forEach(([key, value]) => {
                    config.url = config.url?.replace(`:${key}`, String(value));
                });
            }
            // Handle multipart form data
            if (config.headers['Content-Type'] === 'multipart/form-data') {
                delete config.data.message_reference;
                const formData = new formdata_node_1.FormData();
                Object.entries(config.data).forEach(([key, value]) => {
                    if (value !== undefined) {
                        formData.set(key, value);
                    }
                });
                config.data = formData;
            }
            return config;
        });
        this.request.interceptors.response.use((res) => res, (res) => {
            if (!res?.response?.data)
                return Promise.reject(res);
            const { code = res.response.status, message = res.response.statusText } = res.response.data;
            if ([304023, 304024].includes(code)) {
                this.logger.warn(message);
                return Promise.resolve(res.response.data);
            }
            const error = new Error(`Request "${res.config.url}" failed with code(${code}): ${message}`);
            return Promise.reject(error);
        });
    }
}
exports.Client = Client;
