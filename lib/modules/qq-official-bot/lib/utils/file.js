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
exports.getBase64FromLocal = getBase64FromLocal;
exports.getBase64FromWeb = getBase64FromWeb;
exports.getFileBase64 = getFileBase64;
const fs = __importStar(require("fs"));
const axios_1 = __importDefault(require("axios"));
async function getBase64FromLocal(filepath) {
    return (await fs.readFileSync(filepath.replace("file://", ""))).toString('base64');
}
async function getBase64FromWeb(url) {
    const res = await axios_1.default.get(url, {
        responseType: 'arraybuffer'
    });
    return Buffer.from(res.data).toString('base64');
}
function getFileBase64(file) {
    if (Buffer.isBuffer(file))
        return file.toString('base64');
    if (file.startsWith('http'))
        return getBase64FromWeb(file);
    if (file.startsWith('base64://'))
        return file.replace('base64://', '');
    try {
        return getBase64FromLocal(file);
    }
    catch { }
    return file;
}
