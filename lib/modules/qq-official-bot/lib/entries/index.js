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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 数据实体类入口文件
 */
__exportStar(require("./channel"), exports);
__exportStar(require("./contactable"), exports);
__exportStar(require("./friend"), exports);
__exportStar(require("./group"), exports);
__exportStar(require("./groupMember"), exports);
__exportStar(require("./guild"), exports);
__exportStar(require("./guildMember"), exports);
__exportStar(require("./user"), exports);
