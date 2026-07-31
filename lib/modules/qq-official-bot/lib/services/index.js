"use strict";
/**
 * 服务模块导出
 * 集中导出所有API服务类
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotService = exports.AudioService = exports.ThreadService = exports.ScheduleService = exports.ReactionService = exports.PermissionService = exports.MemberService = exports.MessageService = exports.ChannelService = exports.GuildService = void 0;
var guild_1 = require("./guild");
Object.defineProperty(exports, "GuildService", { enumerable: true, get: function () { return guild_1.GuildService; } });
var channel_1 = require("./channel");
Object.defineProperty(exports, "ChannelService", { enumerable: true, get: function () { return channel_1.ChannelService; } });
var message_1 = require("./message");
Object.defineProperty(exports, "MessageService", { enumerable: true, get: function () { return message_1.MessageService; } });
var member_1 = require("./member");
Object.defineProperty(exports, "MemberService", { enumerable: true, get: function () { return member_1.MemberService; } });
var permission_1 = require("./permission");
Object.defineProperty(exports, "PermissionService", { enumerable: true, get: function () { return permission_1.PermissionService; } });
var reaction_1 = require("./reaction");
Object.defineProperty(exports, "ReactionService", { enumerable: true, get: function () { return reaction_1.ReactionService; } });
var schedule_1 = require("./schedule");
Object.defineProperty(exports, "ScheduleService", { enumerable: true, get: function () { return schedule_1.ScheduleService; } });
var thread_1 = require("./thread");
Object.defineProperty(exports, "ThreadService", { enumerable: true, get: function () { return thread_1.ThreadService; } });
var audio_1 = require("./audio");
Object.defineProperty(exports, "AudioService", { enumerable: true, get: function () { return audio_1.AudioService; } });
var bot_1 = require("./bot");
Object.defineProperty(exports, "BotService", { enumerable: true, get: function () { return bot_1.BotService; } });
