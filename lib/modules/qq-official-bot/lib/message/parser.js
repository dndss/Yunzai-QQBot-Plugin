"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Message = void 0;
const _1 = require("..");
const string_1 = require("../utils/string");
function splitNumberedSections(content, marker) {
    const matches = [...content.matchAll(marker)];
    if (!matches.length || content.slice(0, matches[0].index).trim())
        return;
    return matches.map((match, index) => {
        const start = (match.index || 0) + match[0].length;
        const end = matches[index + 1]?.index ?? content.length;
        return {
            index: Number(match[1]),
            body: content.slice(start, end).replace(/^\n/, '').replace(/\n+$/, '')
        };
    });
}
function dedent(content) {
    const lines = content.split('\n');
    const indents = lines
        .filter(line => line.trim())
        .map(line => line.match(/^[ \t]*/)?.[0].length || 0);
    const indent = indents.length ? Math.min(...indents) : 0;
    return indent ? lines.map(line => line.slice(Math.min(indent, line.length))).join('\n') : content;
}
function parseForwardNodes(content, nested = false) {
    const marker = nested ? /^--- 第(\d+)条 ---$/gm : /^=== 消息 (\d+) ===$/gm;
    const sections = splitNumberedSections(content, marker);
    if (!sections)
        return;
    const nodes = [];
    for (const section of sections) {
        const node = parseForwardNode(nested ? dedent(section.body) : section.body, section.index);
        if (!node)
            return;
        nodes.push(node);
    }
    return nodes;
}
function parseForwardNode(content, index) {
    const prefix = '[消息内容]';
    if (!content.startsWith(prefix))
        return;
    const senderPattern = /^\[发送者\][ \t]*(.*)$/gm;
    const senderMatches = [...content.matchAll(senderPattern)];
    const senderMatch = senderMatches.at(-1);
    if (!senderMatch || senderMatch.index === undefined || !senderMatch[1].trim())
        return;
    const messageContent = content
        .slice(prefix.length, senderMatch.index)
        .replace(/^ /, '')
        .replace(/\n$/, '');
    const senderLineEnd = senderMatch.index + senderMatch[0].length;
    const tail = content.slice(senderLineEnd).replace(/^\n/, '').replace(/\n+$/, '');
    const node = {
        index,
        sender_name: senderMatch[1].trim(),
        content: messageContent
    };
    if (!tail)
        return node;
    const nestedPrefix = '[消息类型] 合并转发消息\n[关联消息]\n';
    if (!tail.startsWith(nestedPrefix))
        return;
    const children = parseForwardNodes(tail.slice(nestedPrefix.length), true);
    if (!children)
        return;
    node.message_type = 'forward';
    node.children = children;
    return node;
}
function parseForwardMessage(content) {
    const normalized = content.replace(/\r\n/g, '\n').replace(/\n+$/, '');
    const titleMatch = normalized.match(/^\[([^\n]+)\]\n/);
    if (!titleMatch)
        return;
    const nodes = parseForwardNodes(normalized.slice(titleMatch[0].length));
    if (!nodes)
        return;
    return {
        title: titleMatch[1],
        nodes,
        raw: content
    };
}
class Message {
    get self_id() {
        return this.bot.self_id;
    }
    constructor(bot, attrs) {
        this.bot = bot;
        this.sub_type = 'normal';
        const { message_reference, ...otherAttrs } = attrs;
        Object.assign(this, otherAttrs);
        if (message_reference) {
            this.source = {
                id: message_reference.message_id,
                message_id: message_reference.message_id,
            };
        }
    }
    get [Symbol.unscopables]() {
        return {
            bot: true
        };
    }
    toJSON() {
        return Object.fromEntries(Object.keys(this)
            .filter(key => {
            return typeof this[key] !== "function" && !(this[key] instanceof _1.Bot);
        })
            .map(key => [key, this[key]]));
    }
}
exports.Message = Message;
(function (Message) {
    function parse(payload) {
        let template = (payload.content || '').trimStart();
        let result = [];
        let brief = '';
        // 1. 处理文字表情混排
        const regex = /("[^"]*?"|'[^']*?'|`[^`]*?`|“[^”]*?”|‘[^’]*?’|<[^>]+?>)/;
        if (payload.message_reference) {
            result.push({
                type: 'reply',
                data: {
                    id: payload.message_reference.message_id
                }
            });
            brief += `<reply,id=${payload.message_reference.message_id}>`;
        }
        if (Number(payload.message_type) === 102) {
            const forward = parseForwardMessage(payload.content || '');
            if (forward) {
                result.push({ type: 'forward', data: forward });
                brief += payload.content || '';
                delete payload.attachments;
                return [result, brief];
            }
        }
        while (template.length) {
            const [match] = template.match(regex) || [];
            if (!match)
                break;
            const index = template.indexOf(match);
            const prevText = template.slice(0, index);
            if (prevText) {
                result.push({
                    type: 'text',
                    data: { text: prevText }
                });
                brief += prevText;
            }
            template = template.slice(index + match.length);
            if (match.startsWith('<')) {
                let [type, ...attrs] = match.slice(1, -1).split(',');
                if (type.startsWith('faceType')) {
                    type = 'face';
                    attrs = attrs.map((attr) => attr.replace('faceId', 'id'));
                }
                else if (type.startsWith('@')) {
                    const id = type.replace(/^@!?/, '');
                    const isAll = id === 'all' || id === 'everyone';
                    const mentions = Array.isArray(payload.mentions) ? payload.mentions : [];
                    const mention = isAll
                        ? mentions.find((u) => u.scope === 'all')
                        : mentions.find((u) => [u.id, u.member_openid, u.user_openid].includes(id));
                    const mentionData = { ...(mention || {}) };
                    delete mentionData.id;
                    mentionData.user_id = isAll
                        ? 'all'
                        : mention?.id || mention?.member_openid || mention?.user_openid || id;
                    type = 'at';
                    attrs = Object.entries(mentionData)
                        .map(([key, value]) => `${key}=${value}`);
                }
                else if (/^[a-z]+:[0-9]+$/.test(type)) {
                    attrs = ['id=' + type.split(':')[1]];
                    type = 'face';
                }
                if ([
                    'text',
                    'face',
                    'at',
                    'image',
                    'video',
                    'audio',
                    'markdown',
                    'button',
                    'link',
                    'reply',
                    'ark',
                    'embed'
                ].includes(type)) {
                    result.push({
                        type,
                        data: Object.fromEntries(attrs.map((attr) => {
                            const [key, ...values] = attr.split('=');
                            return [key.toLowerCase(), (0, string_1.trimQuote)(values.join('='))];
                        }))
                    });
                    brief += `<${type},${attrs.join(',')}>`;
                }
                else {
                    result.push({
                        type: 'text',
                        data: { text: match }
                    });
                }
            }
            else {
                result.push({
                    type: "text",
                    data: { text: match }
                });
                brief += match;
            }
        }
        if (template) {
            result.push({
                type: 'text',
                data: { text: template }
            });
            brief += template;
        }
        // 2. 将附件添加到消息中
        if (payload.attachments) {
            for (const attachment of payload.attachments) {
                let { content_type, ...data } = attachment;
                const [type] = content_type.split('/');
                if (!data.url.startsWith('http'))
                    data.url = `https://${data.url}`;
                if (data.filename) {
                    data.name = data.filename;
                    delete data.filename;
                }
                result.push({
                    type,
                    data,
                });
                brief += `<${type},${Object.entries(data).map(([key, value]) => `${key}=${value}`).join(',')}>`;
            }
        }
        delete payload.attachments;
        return [result, brief];
    }
    Message.parse = parse;
})(Message || (exports.Message = Message = {}));
