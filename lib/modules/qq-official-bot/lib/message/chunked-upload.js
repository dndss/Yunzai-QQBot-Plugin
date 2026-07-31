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
exports.ChunkedUploader = exports.UploadDailyLimitExceededError = void 0;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const path = __importStar(require("node:path"));
const MD5_10M_SIZE = 10002432;
const DEFAULT_CONCURRENT_PARTS = 1;
const MAX_CONCURRENT_PARTS = 10;
const PART_UPLOAD_TIMEOUT = 300000;
const PART_UPLOAD_MAX_RETRIES = 2;
const PART_FINISH_MAX_RETRIES = 2;
const PART_FINISH_RETRYABLE_CODE = 40093001;
const PART_FINISH_DEFAULT_TIMEOUT = 120000;
const PART_FINISH_MAX_TIMEOUT = 600000;
const COMPLETE_UPLOAD_MAX_RETRIES = 2;
const REQUEST_TIMEOUT = 120000;
class UploadDailyLimitExceededError extends Error {
    constructor(filePath, fileSize, message) {
        super(message);
        this.filePath = filePath;
        this.fileSize = fileSize;
        this.name = 'UploadDailyLimitExceededError';
    }
}
exports.UploadDailyLimitExceededError = UploadDailyLimitExceededError;
class ChunkedUploader {
    constructor(request) {
        this.request = request;
    }
    async upload(endpointPath, filePath, fileType, options = {}) {
        const fileStat = await (0, promises_1.stat)(filePath);
        if (!fileStat.isFile())
            throw new Error(`Invalid upload file: ${filePath}`);
        const fileSize = fileStat.size;
        const fileName = sanitizeFileName(options.fileName || path.basename(filePath));
        const hashes = await computeFileHashes(filePath, fileSize);
        let prepared;
        try {
            const { data } = await this.request.post(`${endpointPath}/upload_prepare`, {
                file_type: fileType,
                file_name: fileName,
                file_size: fileSize,
                ...hashes
            }, { timeout: REQUEST_TIMEOUT });
            prepared = data;
        }
        catch (error) {
            if (getErrorCode(error) === 40093002) {
                throw new UploadDailyLimitExceededError(filePath, fileSize, getErrorMessage(error));
            }
            throw error;
        }
        const blockSize = Number(prepared.block_size);
        if (!prepared.upload_id || !Number.isFinite(blockSize) || blockSize <= 0) {
            throw new Error('Invalid upload_prepare response');
        }
        if (!Array.isArray(prepared.parts) || prepared.parts.length === 0) {
            throw new Error('upload_prepare returned no parts');
        }
        const concurrency = clamp(Number(prepared.concurrency) || DEFAULT_CONCURRENT_PARTS, 1, MAX_CONCURRENT_PARTS);
        const retryTimeout = clamp((Number(prepared.retry_timeout) || PART_FINISH_DEFAULT_TIMEOUT / 1000) * 1000, 1000, PART_FINISH_MAX_TIMEOUT);
        let completedParts = 0;
        let uploadedBytes = 0;
        const tasks = prepared.parts.map(part => async () => {
            const partIndex = Number(part.index);
            const offset = (partIndex - 1) * blockSize;
            const partSize = Number(part.block_size) || blockSize;
            const length = Math.min(partSize, fileSize - offset);
            if (!Number.isInteger(partIndex) || partIndex < 1 || length <= 0) {
                throw new Error(`Invalid upload part: ${JSON.stringify(part)}`);
            }
            const chunk = await readFileChunk(filePath, offset, length);
            const md5 = (0, node_crypto_1.createHash)('md5').update(chunk).digest('hex');
            await putToPresignedUrl(part.presigned_url, chunk);
            await this.finishPart(endpointPath, prepared.upload_id, partIndex, chunk.length, md5, retryTimeout);
            completedParts++;
            uploadedBytes += chunk.length;
            options.onProgress?.({
                completedParts,
                totalParts: prepared.parts.length,
                uploadedBytes,
                totalBytes: fileSize
            });
        });
        await runWithConcurrency(tasks, concurrency);
        return this.completeUpload(endpointPath, prepared.upload_id);
    }
    async finishPart(endpointPath, uploadId, partIndex, blockSize, md5, retryTimeout) {
        const body = {
            upload_id: uploadId,
            part_index: partIndex,
            block_size: blockSize,
            md5
        };
        const startedAt = Date.now();
        let normalAttempts = 0;
        while (true) {
            try {
                await this.request.post(`${endpointPath}/upload_part_finish`, body, {
                    timeout: REQUEST_TIMEOUT
                });
                return;
            }
            catch (error) {
                if (getErrorCode(error) === PART_FINISH_RETRYABLE_CODE) {
                    if (Date.now() - startedAt >= retryTimeout)
                        throw error;
                    await delay(1000);
                    continue;
                }
                if (normalAttempts >= PART_FINISH_MAX_RETRIES)
                    throw error;
                await delay(1000 * Math.pow(2, normalAttempts));
                normalAttempts++;
            }
        }
    }
    async completeUpload(endpointPath, uploadId) {
        let lastError;
        for (let attempt = 0; attempt <= COMPLETE_UPLOAD_MAX_RETRIES; attempt++) {
            try {
                const { data } = await this.request.post(`${endpointPath}/files`, { upload_id: uploadId }, { timeout: REQUEST_TIMEOUT });
                return data;
            }
            catch (error) {
                lastError = error;
                if (attempt < COMPLETE_UPLOAD_MAX_RETRIES) {
                    await delay(2000 * Math.pow(2, attempt));
                }
            }
        }
        throw lastError;
    }
}
exports.ChunkedUploader = ChunkedUploader;
async function computeFileHashes(filePath, fileSize) {
    return new Promise((resolve, reject) => {
        const md5 = (0, node_crypto_1.createHash)('md5');
        const sha1 = (0, node_crypto_1.createHash)('sha1');
        const md5First10m = (0, node_crypto_1.createHash)('md5');
        const needsPartialHash = fileSize > MD5_10M_SIZE;
        let processed = 0;
        const stream = (0, node_fs_1.createReadStream)(filePath);
        stream.on('data', chunk => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            md5.update(buffer);
            sha1.update(buffer);
            if (needsPartialHash && processed < MD5_10M_SIZE) {
                const remaining = MD5_10M_SIZE - processed;
                md5First10m.update(buffer.subarray(0, Math.min(buffer.length, remaining)));
            }
            processed += buffer.length;
        });
        stream.on('error', reject);
        stream.on('end', () => {
            const md5Hex = md5.digest('hex');
            resolve({
                md5: md5Hex,
                sha1: sha1.digest('hex'),
                md5_10m: needsPartialHash ? md5First10m.digest('hex') : md5Hex
            });
        });
    });
}
async function readFileChunk(filePath, offset, length) {
    const handle = await (0, promises_1.open)(filePath, 'r');
    try {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, offset);
        if (bytesRead !== length) {
            throw new Error(`Short read at offset ${offset}: expected ${length}, got ${bytesRead}`);
        }
        return buffer;
    }
    finally {
        await handle.close();
    }
}
async function putToPresignedUrl(url, data) {
    let lastError;
    for (let attempt = 0; attempt <= PART_UPLOAD_MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PART_UPLOAD_TIMEOUT);
        try {
            const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
            const response = await fetch(url, {
                method: 'PUT',
                body: new Blob([arrayBuffer]),
                headers: { 'Content-Length': String(data.length) },
                signal: controller.signal
            });
            if (!response.ok) {
                const body = await response.text().catch(() => '');
                throw new Error(`COS PUT failed: ${response.status} ${response.statusText} ${body}`);
            }
            return;
        }
        catch (error) {
            lastError = error;
            if (attempt < PART_UPLOAD_MAX_RETRIES) {
                await delay(1000 * Math.pow(2, attempt));
            }
        }
        finally {
            clearTimeout(timer);
        }
    }
    throw lastError;
}
async function runWithConcurrency(tasks, concurrency) {
    for (let index = 0; index < tasks.length; index += concurrency) {
        await Promise.all(tasks.slice(index, index + concurrency).map(task => task()));
    }
}
function sanitizeFileName(fileName) {
    const name = fileName.split(/[/\\]/).pop()?.replace(/[\u0000-\u001f]/g, '').trim();
    return name || 'file';
}
function getErrorCode(error) {
    const directCode = Number(error?.response?.data?.code ?? error?.response?.data?.err_code);
    if (Number.isFinite(directCode))
        return directCode;
    const match = getErrorMessage(error).match(/code\((\d+)\)/);
    return match ? Number(match[1]) : undefined;
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
