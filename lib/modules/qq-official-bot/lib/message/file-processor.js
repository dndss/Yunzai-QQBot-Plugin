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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileProcessor = void 0;
/**
 * 文件处理器 - 专门负责文件上传和处理
 */
const fs = __importStar(require("node:fs"));
const file_1 = require("../utils/file");
/**
 * 文件处理器
 * 专门负责文件的上传、处理和管理
 */
class FileProcessor {
    constructor(request) {
        this.request = request;
    }
    /**
     * 上传媒体文件
     */
    async uploadMedia(fileData, options) {
        // 转换文件数据为base64格式
        const base64Data = await (0, file_1.getFileBase64)(fileData);
        // 构建上传请求
        const uploadPayload = {
            file_type: options.fileType,
            file_data: base64Data,
            ...(options.fileType === 4 && options.fileName ? { file_name: options.fileName } : {}),
            srv_send_msg: options.sendMessage || false
        };
        // 发送上传请求
        const { data: result } = await this.request.post(`/v2/${options.targetType}s/${options.targetId}/files`, uploadPayload);
        return result;
    }
    /**
     * 批量上传文件
     */
    async uploadMultipleFiles(files, options) {
        const results = [];
        for (const file of files) {
            const result = await this.uploadMedia(file.data, {
                ...options,
                fileType: file.type
            });
            results.push(result);
        }
        return results;
    }
    /**
     * 检查文件类型
     */
    validateFileType(fileData, expectedType) {
        // 这里可以添加文件类型验证逻辑
        // 例如检查文件头、扩展名等
        return true;
    }
    /**
     * 获取文件大小
     */
    getFileSize(fileData) {
        if (Buffer.isBuffer(fileData)) {
            return fileData.length;
        }
        if (typeof fileData === 'string') {
            if (fileData.startsWith('base64://')) {
                return Buffer.from(fileData.slice(9), 'base64').length;
            }
            else if (fileData.startsWith('data:')) {
                const base64Data = fileData.split(',')[1];
                return Buffer.from(base64Data, 'base64').length;
            }
        }
        return 0;
    }
    /**
     * 检查文件大小限制
     */
    checkFileSizeLimit(fileData, maxSize = 10 * 1024 * 1024) {
        const fileSize = this.getFileSize(fileData);
        return fileSize <= maxSize;
    }
    /**
     * 从URL下载文件
     */
    async downloadFromUrl(url) {
        const axios = require('axios');
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 30000,
            maxContentLength: 10 * 1024 * 1024 // 10MB limit
        });
        return Buffer.from(response.data);
    }
    /**
     * 清理临时文件
     */
    async cleanupTempFiles(filePaths) {
        for (const filePath of filePaths) {
            fs.unlinkSync(filePath);
        }
    }
}
exports.FileProcessor = FileProcessor;
