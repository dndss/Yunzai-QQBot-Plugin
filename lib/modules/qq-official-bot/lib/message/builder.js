"use strict";
/**
 * 消息构建器 - 专门负责构建消息内容
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageBuilder = void 0;
const utils_1 = require("../utils");
const crypto_1 = require("crypto");
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const node_url_1 = require("node:url");
/**
 * 消息构建器
 * 专门负责将Sendable类型的消息转换为API所需的格式
 */
class MessageBuilder {
    constructor(appid, isGuild, source) {
        this.appid = appid;
        this.isGuild = isGuild;
        this.source = source;
        this.buttons = [];
        this.isFile = false;
        this.contentType = 'application/json';
        this.brief = '';
        this.messagePayload = {
            msg_seq: (0, crypto_1.randomInt)(1, 1000000),
            content: ''
        };
        this.filePayload = {};
        if (source?.id) {
            this.messagePayload.msg_id = source.id;
        }
        if (source?.event_id) {
            this.messagePayload.event_id = source.event_id;
        }
    }
    /**
     * 构建消息
     */
    async build(message) {
        await this.processMessage(message);
        await this.processButtons();
        return {
            messagePayload: this.messagePayload,
            filePayload: this.filePayload,
            isFile: this.isFile,
            contentType: this.contentType,
            brief: this.brief
        };
    }
    /**
     * 处理消息内容
     */
    async processMessage(message) {
        if (!Array.isArray(message)) {
            message = [message];
        }
        const messageQueue = [...message];
        while (messageQueue.length) {
            const elem = messageQueue.shift();
            if (typeof elem === 'string') {
                const parsedElems = this.parseFromTemplate(elem);
                messageQueue.unshift(...parsedElems);
                continue;
            }
            await this.processElement(elem);
        }
    }
    /**
     * 处理单个消息元素
     */
    async processElement(elem) {
        switch (elem.type) {
            case 'reply':
                this.handleReply(elem);
                break;
            case 'at':
                this.handleAt(elem);
                break;
            case 'link':
                this.handleLink(elem);
                break;
            case 'text':
                this.handleText(elem);
                break;
            case 'face':
                this.handleFace(elem);
                break;
            case 'image':
            case 'audio':
            case 'video':
            case 'file':
                await this.handleMedia(elem);
                break;
            case 'markdown':
                this.handleMarkdown(elem);
                break;
            case 'keyboard':
                this.handleKeyboard(elem);
                break;
            case 'button':
                this.handleButton(elem);
                break;
            case 'embed':
                this.handleEmbed(elem);
                break;
            case 'ark':
                this.handleArk(elem);
                break;
            default:
                console.warn(`未知的消息元素类型: ${elem.type}`);
                break;
        }
    }
    /**
     * 处理回复元素
     */
    handleReply(elem) {
        if (elem.data.event_id) {
            this.messagePayload.event_id = elem.data.event_id;
            this.brief += `<reply,event_id=${elem.data.event_id}>`;
        }
        else if (elem.data.id) {
            this.messagePayload.msg_id = elem.data.id;
            this.messagePayload.message_reference = {
                message_id: elem.data.id
            };
            this.brief += `<reply,msg_id=${elem.data.id}>`;
        }
    }
    /**
     * 处理@元素
     */
    handleAt(elem) {
        const userId = elem.data.user_id === 'all' ? 'everyone' : elem.data.user_id;
        this.messagePayload.content += `<@${userId}>`;
        this.brief += `<at,user=${userId}>`;
    }
    /**
     * 处理链接元素
     */
    handleLink(elem) {
        this.messagePayload.content += `<#${elem.data.channel_id}>`;
        this.brief += `<link,channel=${elem.data.channel_id}>`;
    }
    /**
     * 处理文本元素
     */
    handleText(elem) {
        this.messagePayload.content += elem.data.text;
        this.brief += elem.data.text;
    }
    /**
     * 处理表情元素
     */
    handleFace(elem) {
        this.messagePayload.content += `<emoji:${elem.data.id}>`;
        this.brief += `<face,id=${elem.data.id}>`;
    }
    /**
     * 处理媒体元素（图片、视频、音频）
     */
    async handleMedia(elem) {
        const mediaType = this.getMediaType(elem.type);
        if (this.isGuild && mediaType === 4) {
            throw new Error('Guild messages do not support file elements');
        }
        // 如果是回复消息，需要特殊处理
        if (this.messagePayload.msg_id || this.messagePayload.event_id) { // 频道消息的文件处理
            const { url, blob, base64, localPath } = await this.formatMediaData(elem, !this.isGuild);
            if (this.isGuild) {
                this.contentType = 'multipart/form-data';
                if (blob) {
                    this.messagePayload.file_image = blob;
                }
                else {
                    this.messagePayload.image = url;
                }
            }
            else {
                // 群聊/私聊消息的文件处理
                this.messagePayload.msg_type = 7;
                // 这里需要调用上传接口，暂时标记为需要文件上传
                this.isFile = true;
                this.filePayload.file_type = mediaType;
                if (localPath) {
                    this.filePayload.local_path = localPath;
                }
                else if (base64) {
                    this.filePayload.file_data = base64;
                }
                else {
                    this.filePayload.url = url;
                }
                if (mediaType === 4) {
                    this.filePayload.file_name = this.getFileName(elem, localPath, url);
                }
            }
        }
        else {
            const { url, blob, base64, localPath } = await this.formatMediaData(elem, !this.isGuild);
            // 非回复消息的处理
            if (this.isGuild) {
                if (blob) {
                    this.messagePayload.file_image = blob;
                }
                else {
                    this.messagePayload.image = url;
                }
            }
            else {
                this.messagePayload.msg_type = 7;
                this.isFile = true;
                this.filePayload.file_type = mediaType;
                if (localPath) {
                    this.filePayload.local_path = localPath;
                }
                else if (base64) {
                    this.filePayload.file_data = base64;
                }
                else {
                    this.filePayload.url = url;
                }
                if (mediaType === 4) {
                    this.filePayload.file_name = this.getFileName(elem, localPath, url);
                }
            }
        }
        this.brief += `<${elem.type}:${this.getFileHash(elem.data.file)}>`;
    }
    /**
     * 处理Markdown元素
     */
    handleMarkdown(elem) {
        this.messagePayload.markdown = elem.data;
        this.messagePayload.msg_type = 2;
        const content = elem.data.content ? `content=${elem.data.content}` : `template_id=${elem.data.custom_template_id}`;
        this.brief += `<markdown,${content}>`;
    }
    /**
     * 处理键盘元素
     */
    handleKeyboard(elem) {
        this.messagePayload.msg_type = 2;
        this.messagePayload.keyboard = elem.data;
        this.messagePayload.bot_appid = this.appid;
        this.brief += `<keyboard>`;
    }
    /**
     * 处理按钮元素
     */
    handleButton(elem) {
        this.buttons.push(elem.data);
        this.brief += `<button,data=${JSON.stringify(elem.data)}>`;
    }
    /**
     * 处理嵌入元素
     */
    handleEmbed(elem) {
        if (!this.isGuild)
            return;
        this.messagePayload.msg_type = 4;
        this.messagePayload.embed = elem.data;
        this.brief += `<embed>`;
    }
    /**
     * 处理ARK元素
     */
    handleArk(elem) {
        this.messagePayload.msg_type = 3;
        this.messagePayload.ark = elem.data;
        this.brief += `<ark>`;
    }
    /**
     * 处理按钮组
     */
    async processButtons() {
        if (this.buttons.length === 0)
            return;
        const rows = [];
        let row = [];
        for (let i = 0; i < this.buttons.length; i++) {
            if (row.length >= 5) {
                rows.push(row);
                row = [];
            }
            // 支持按钮模板发送
            if (this.buttons[i].id) {
                this.messagePayload.keyboard = {
                    id: this.buttons[i].id,
                    bot_appid: this.appid
                };
                return;
            }
            // 如果是按钮组，则直接添加到行中
            if (Array.isArray(this.buttons[i].buttons)) {
                rows.push(this.buttons[i].buttons);
            }
            else {
                row.push(this.buttons[i]);
            }
        }
        if (row.length > 0) {
            rows.push(row);
        }
        this.messagePayload.keyboard = {
            content: {
                rows: rows.map(row => ({
                    buttons: row
                }))
            },
            bot_appid: this.appid
        };
    }
    /**
     * 从模板字符串解析消息元素
     */
    parseFromTemplate(template) {
        const result = [];
        let cursor = 0;
        while (cursor < template.length) {
            const tagStart = template.indexOf('<', cursor);
            if (tagStart === -1) {
                const text = template.slice(cursor);
                if (text) {
                    result.push({
                        type: 'text',
                        data: { text }
                    });
                }
                break;
            }
            if (tagStart > cursor) {
                result.push({
                    type: 'text',
                    data: { text: template.slice(cursor, tagStart) }
                });
            }
            const tagEnd = template.indexOf('>', tagStart + 1);
            if (tagEnd === -1) {
                const text = template.slice(tagStart);
                if (text) {
                    result.push({
                        type: 'text',
                        data: { text }
                    });
                }
                break;
            }
            const match = template.slice(tagStart, tagEnd + 1);
            cursor = tagEnd + 1;
            const [type, ...attrArr] = match.slice(1, -1).split(',');
            const attrs = Object.fromEntries(attrArr.map((attr) => {
                const [key, value] = attr.split('=');
                try {
                    return [key, JSON.parse(value)];
                }
                catch {
                    return [key, value];
                }
            }));
            result.push({
                type,
                data: attrs
            });
        }
        return result;
    }
    /**
     * 准备频道媒体数据
     */
    async formatMediaData(elem, preserveLocalPath = false) {
        if ('url' in elem.data && elem.data.url)
            return { url: elem.data.url };
        if (typeof elem.data.file === "string" && elem.data.file.startsWith('http')) {
            return { url: elem.data.file };
        }
        if (Buffer.isBuffer(elem.data.file)) {
            return {
                url: '',
                blob: new Blob([Buffer.from(elem.data.file)]),
                base64: elem.data.file.toString('base64')
            };
        }
        else if (typeof elem.data.file !== "string") {
            throw new Error("无效的文件参数: " + elem.data.file);
        }
        else if (elem.data.file.startsWith("base64://")) {
            return {
                url: '',
                blob: new Blob([Buffer.from(elem.data.file.slice(9), 'base64')]),
                base64: elem.data.file.slice(9)
            };
        }
        else if (/^data:[^/]+\/[^;]+;base64,/.test(elem.data.file)) {
            return {
                url: '',
                blob: new Blob([Buffer.from(elem.data.file.replace(/^data:[^/]+\/[^;]+;base64,/, ''), 'base64')]),
                base64: elem.data.file.replace(/^data:[^/]+\/[^;]+;base64,/, '')
            };
        }
        else {
            try {
                const localPath = elem.data.file.startsWith('file://')
                    ? (0, node_url_1.fileURLToPath)(elem.data.file)
                    : elem.data.file;
                if (preserveLocalPath)
                    return { url: '', localPath };
                const buffer = await fs.readFile(localPath);
                return {
                    url: '',
                    blob: new Blob([buffer]),
                    base64: buffer.toString('base64')
                };
            }
            catch {
                throw new Error("无效的文件路径: " + elem.data.file);
            }
        }
    }
    /**
     * 获取媒体类型编号
     */
    getMediaType(type) {
        const types = {
            image: 1,
            video: 2,
            audio: 3,
            file: 4
        };
        const mediaType = types[type];
        if (!mediaType)
            throw new Error(`Unsupported media type: ${type}`);
        return mediaType;
    }
    getFileName(elem, localPath, url) {
        if (elem.data.name)
            return this.sanitizeFileName(elem.data.name);
        if (localPath)
            return this.sanitizeFileName(path.basename(localPath));
        if (url) {
            try {
                return this.sanitizeFileName(decodeURIComponent(new URL(url).pathname));
            }
            catch { }
        }
        return 'file';
    }
    sanitizeFileName(fileName) {
        const name = fileName.split(/[/\\]/).pop()?.replace(/[\u0000-\u001f]/g, '').trim();
        return name || 'file';
    }
    /**
     * 获取文件哈希值
     */
    getFileHash(file) {
        try {
            return (0, utils_1.md5)(file);
        }
        catch {
            return 'unknown';
        }
    }
}
exports.MessageBuilder = MessageBuilder;
