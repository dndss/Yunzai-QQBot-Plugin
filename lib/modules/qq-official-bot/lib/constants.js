"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpeakPermission = exports.PrivateType = exports.ChannelSubType = exports.ChannelType = exports.Intends = exports.WebsocketCloseReason = exports.SessionEvents = exports.UnsupportedMethodError = exports.OpCode = void 0;
// 心跳参数
var OpCode;
(function (OpCode) {
    OpCode[OpCode["DISPATCH"] = 0] = "DISPATCH";
    OpCode[OpCode["HEARTBEAT"] = 1] = "HEARTBEAT";
    OpCode[OpCode["IDENTIFY"] = 2] = "IDENTIFY";
    OpCode[OpCode["RESUME"] = 6] = "RESUME";
    OpCode[OpCode["RECONNECT"] = 7] = "RECONNECT";
    OpCode[OpCode["INVALID_SESSION"] = 9] = "INVALID_SESSION";
    OpCode[OpCode["HELLO"] = 10] = "HELLO";
    OpCode[OpCode["HEARTBEAT_ACK"] = 11] = "HEARTBEAT_ACK";
    OpCode[OpCode["HTTP_CALLBACK_ACK"] = 12] = "HTTP_CALLBACK_ACK";
    OpCode[OpCode["SIGN_VERIFY"] = 13] = "SIGN_VERIFY";
})(OpCode || (exports.OpCode = OpCode = {}));
exports.UnsupportedMethodError = new Error('暂未支持');
exports.SessionEvents = {
    CLOSED: "CLOSED",
    READY: "READY", // 已经可以通信
    ERROR: "ERROR", // 会话错误
    INVALID_SESSION: "INVALID_SESSION",
    RECONNECT: "RECONNECT", // 服务端通知重新连接
    DISCONNECT: "DISCONNECT", // 断线
    EVENT_WS: "EVENT_WS", // 内部通信
    RESUMED: "RESUMED", // 重连
    DEAD: "DEAD" // 连接已死亡，请检查网络或重启
};
// websocket错误原因
exports.WebsocketCloseReason = [
    {
        code: 4001,
        reason: "无效的opcode"
    },
    {
        code: 4002,
        reason: "无效的payload"
    },
    {
        code: 4007,
        reason: "seq错误"
    },
    {
        code: 4008,
        reason: "发送 payload 过快，请重新连接，并遵守连接后返回的频控信息",
        resume: true
    },
    {
        code: 4009,
        reason: "连接过期，请重连",
        resume: true
    },
    {
        code: 4010,
        reason: "无效的shard"
    },
    {
        code: 4011,
        reason: "连接需要处理的guild过多，请进行合理分片"
    },
    {
        code: 4012,
        reason: "无效的version"
    },
    {
        code: 4013,
        reason: "无效的intent"
    },
    {
        code: 4014,
        reason: "intent无权限"
    },
    {
        code: 4900,
        reason: "内部错误，请重连"
    },
    {
        code: 4914,
        reason: "机器人已下架,只允许连接沙箱环境,请断开连接,检验当前连接环境"
    },
    {
        code: 4915,
        reason: "机器人已封禁,不允许连接,请断开连接,申请解封后再连接"
    }
];
var Intends;
(function (Intends) {
    Intends[Intends["GUILDS"] = 1] = "GUILDS";
    Intends[Intends["GUILD_MEMBERS"] = 2] = "GUILD_MEMBERS";
    Intends[Intends["GUILD_MESSAGES"] = 512] = "GUILD_MESSAGES";
    Intends[Intends["GUILD_MESSAGE_REACTIONS"] = 1024] = "GUILD_MESSAGE_REACTIONS";
    Intends[Intends["DIRECT_MESSAGE"] = 4096] = "DIRECT_MESSAGE";
    Intends[Intends["GROUP_MEMBER"] = 16777216] = "GROUP_MEMBER";
    Intends[Intends["GROUP_AND_C2C_EVENT"] = 33554432] = "GROUP_AND_C2C_EVENT";
    Intends[Intends["INTERACTION"] = 67108864] = "INTERACTION";
    Intends[Intends["MESSAGE_AUDIT"] = 134217728] = "MESSAGE_AUDIT";
    Intends[Intends["FORUMS_EVENT"] = 268435456] = "FORUMS_EVENT";
    Intends[Intends["AUDIO_ACTION"] = 536870912] = "AUDIO_ACTION";
    Intends[Intends["PUBLIC_GUILD_MESSAGES"] = 1073741824] = "PUBLIC_GUILD_MESSAGES";
})(Intends || (exports.Intends = Intends = {}));
var ChannelType;
(function (ChannelType) {
    ChannelType[ChannelType["Content"] = 0] = "Content";
    ChannelType[ChannelType["Record"] = 2] = "Record";
    ChannelType[ChannelType["ChannelGroup"] = 4] = "ChannelGroup";
    ChannelType[ChannelType["Live"] = 10005] = "Live";
    ChannelType[ChannelType["App"] = 10006] = "App";
    ChannelType[ChannelType["Forms"] = 10007] = "Forms";
})(ChannelType || (exports.ChannelType = ChannelType = {}));
var ChannelSubType;
(function (ChannelSubType) {
    ChannelSubType[ChannelSubType["Chat"] = 0] = "Chat";
    ChannelSubType[ChannelSubType["Announces"] = 1] = "Announces";
    ChannelSubType[ChannelSubType["Strategy"] = 2] = "Strategy";
    ChannelSubType[ChannelSubType["Black"] = 3] = "Black";
})(ChannelSubType || (exports.ChannelSubType = ChannelSubType = {}));
var PrivateType;
(function (PrivateType) {
    PrivateType[PrivateType["Public"] = 0] = "Public";
    PrivateType[PrivateType["Admin"] = 1] = "Admin";
    PrivateType[PrivateType["Some"] = 2] = "Some";
})(PrivateType || (exports.PrivateType = PrivateType = {}));
var SpeakPermission;
(function (SpeakPermission) {
    SpeakPermission[SpeakPermission["All"] = 1] = "All";
    SpeakPermission[SpeakPermission["Some"] = 2] = "Some";
})(SpeakPermission || (exports.SpeakPermission = SpeakPermission = {}));
