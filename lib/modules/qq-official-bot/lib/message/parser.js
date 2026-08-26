"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Message = void 0;
const _1 = require("..");
const string_1 = require("../utils/string");
function decodeBase64Text(value) {
    if (typeof value !== 'string' || !value)
        return;
    try {
        const payload = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
        return typeof payload.text === 'string' && payload.text ? payload.text : undefined;
    }
    catch {
        return;
    }
}
function parseInlineAttrs(attrs) {
    return Object.fromEntries(attrs.map(attr => {
        const [key, ...values] = attr.split('=');
        return [key.toLowerCase(), (0, string_1.trimQuote)(values.join('='))];
    }));
}
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
    const marker = nested ? /^[ \t]*--- 第(\d+)条 ---$/gm : /^[ \t]*=== 消息 (\d+) ===$/gm;
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
function parseForwardAttachment(index, content) {
    const fieldPattern = /(?:^|[ \t]+)(类型|文件名|尺寸|大小|URL):/g;
    const matches = [...content.matchAll(fieldPattern)];
    const fields = {};
    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const start = (match.index || 0) + match[0].length;
        const end = matches[i + 1]?.index ?? content.length;
        fields[match[1]] = content.slice(start, end).trim();
    }
    const rawType = fields['类型'];
    if (!rawType)
        return;
    let type = 'file';
    if (rawType === '动图' || rawType.includes('图片'))
        type = 'image';
    else if (rawType.includes('视频'))
        type = 'video';
    else if (rawType.includes('语音') || rawType.includes('音频'))
        type = 'audio';
    const size = fields['尺寸']?.match(/^(\d+)x(\d+)$/i);
    return {
        index,
        type,
        raw_type: rawType,
        ...(fields['文件名'] ? { file_name: fields['文件名'] } : {}),
        ...(size ? { width: Number(size[1]), height: Number(size[2]) } : {}),
        ...(fields['大小'] ? { size_text: fields['大小'] } : {}),
        ...(fields['URL'] ? { url: fields['URL'] } : {}),
        ...(rawType === '动图' ? { animated: true } : {}),
    };
}
function parseForwardNode(content, index) {
    const nestedPrefix = '[消息类型] 合并转发消息\n[关联消息]\n';
    const nestedIndex = content.indexOf(nestedPrefix);
    const nodeContent = nestedIndex >= 0 ? content.slice(0, nestedIndex) : content;
    const nestedContent = nestedIndex >= 0 ? content.slice(nestedIndex + nestedPrefix.length) : '';
    const lines = nodeContent.replace(/\n+$/, '').split('\n');
    let senderIndex = -1;
    let senderName = '';
    for (let i = lines.length - 1; i >= 0; i--) {
        const sender = lines[i].match(/^\[发送者\][ \t]*(.*)$/);
        if (!sender?.[1].trim())
            continue;
        senderIndex = i;
        senderName = sender[1].trim();
        break;
    }
    if (senderIndex < 0)
        return;
    const attachments = [];
    const contentLines = [];
    for (let i = 0; i < lines.length; i++) {
        if (i === senderIndex)
            continue;
        const attachmentMatch = lines[i].match(/^\[附件(\d+)\][ \t]*(.*)$/);
        if (!attachmentMatch) {
            contentLines.push(lines[i]);
            continue;
        }
        const attachment = parseForwardAttachment(Number(attachmentMatch[1]), attachmentMatch[2]);
        if (attachment)
            attachments.push(attachment);
        else
            contentLines.push(lines[i]);
    }
    while (contentLines.length && !contentLines[0].trim())
        contentLines.shift();
    while (contentLines.length && !contentLines.at(-1)?.trim())
        contentLines.pop();
    if (contentLines[0]?.startsWith('[消息内容]'))
        contentLines[0] = contentLines[0].slice('[消息内容]'.length).replace(/^ /, '');
    const node = {
        index,
        sender_name: senderName,
        content: contentLines.join('\n'),
        ...(attachments.length ? { attachments } : {}),
    };
    if (!nestedContent)
        return node;
    const children = parseForwardNodes(nestedContent, true);
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
        const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
        const consumedAttachmentIndexes = new Set();
        const hasImageAttachment = attachments
            .some(attachment => attachment.content_type?.startsWith('image/'));
        const appendAttachment = (attachment, description) => {
            let { content_type, ...data } = attachment;
            if (typeof content_type !== 'string')
                return false;
            const [category] = content_type.split('/');
            const type = ['image', 'video', 'audio'].includes(category) ? category : 'file';
            if (typeof data.url === 'string' && !data.url.startsWith('http'))
                data.url = `https://${data.url}`;
            if (data.filename) {
                data.name = data.filename;
                delete data.filename;
            }
            if (description)
                data.description = description;
            result.push({ type, data });
            brief += `<${type},${Object.entries(data).map(([key, value]) => `${key}=${value}`).join(',')}>`;
            return true;
        };
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
                if (type.startsWith('attachmentType=')) {
                    const marker = parseInlineAttrs([type, ...attrs]);
                    const attachmentIndex = Number(marker.attachmentindex);
                    const attachment = attachments[attachmentIndex];
                    if (Number.isInteger(attachmentIndex)
                        && attachmentIndex >= 0
                        && typeof marker.attachmenttype === 'string'
                        && attachment?.content_type === marker.attachmenttype) {
                        if (!consumedAttachmentIndexes.has(attachmentIndex)) {
                            appendAttachment(attachment, decodeBase64Text(marker.description));
                            consumedAttachmentIndexes.add(attachmentIndex);
                        }
                        continue;
                    }
                }
                else if (type.startsWith('faceType')) {
                    // faceType=6 is the placeholder for an image-backed sticker.
                    if (type === 'faceType=6' && hasImageAttachment)
                        continue;
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
                    const data = parseInlineAttrs(attrs);
                    if (type === 'face') {
                        const text = decodeBase64Text(data.ext);
                        if (text) {
                            if (!data.id) {
                                result.push({ type: 'text', data: { text } });
                                brief += text;
                                continue;
                            }
                            delete data.ext;
                            data.text = text;
                        }
                    }
                    result.push({
                        type,
                        data
                    });
                    brief += type === 'face' && data.text ? data.text : `<${type},${attrs.join(',')}>`;
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
        for (let index = 0; index < attachments.length; index++) {
            if (!consumedAttachmentIndexes.has(index))
                appendAttachment(attachments[index]);
        }
        delete payload.attachments;
        return [result, brief];
    }
    Message.parse = parse;
})(Message || (exports.Message = Message = {}));
