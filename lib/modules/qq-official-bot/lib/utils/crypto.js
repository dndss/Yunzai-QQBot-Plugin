"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.md5 = void 0;
const crypto_1 = require("crypto");
/** md5 hash */
const md5 = (data) => (0, crypto_1.createHash)("md5").update(data).digest().toString('hex');
exports.md5 = md5;
