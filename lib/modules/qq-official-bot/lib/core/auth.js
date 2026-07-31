"use strict";
/**
 * 认证管理器 - 负责处理QQ Bot的认证相关功能
 * 从SessionManager中提取认证相关功能
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Auth = void 0;
/**
 * 认证管理器
 * 专门负责处理token获取、刷新和网关信息获取
 */
class Auth {
    constructor(config, bot) {
        this.bot = bot;
        this.refreshRetryCount = 0;
        this.config = {
            tokenRefreshBuffer: 45, // 提前45秒刷新
            maxRetries: 3,
            retryDelay: 1000,
            ...config
        };
    }
    /**
     * 获取访问令牌
     * 如果当前token有效则返回，否则重新获取
     */
    async getAccessToken() {
        if (this.isTokenValid()) {
            return this.currentToken.access_token;
        }
        const tokenInfo = await this.fetchNewToken();
        this.setToken(tokenInfo);
        return tokenInfo.access_token;
    }
    /**
     * 强制刷新访问令牌
     */
    async refreshAccessToken() {
        this.bot.logger.debug("[AUTH] 强制刷新访问令牌");
        const tokenInfo = await this.fetchNewToken();
        this.setToken(tokenInfo);
        return tokenInfo;
    }
    /**
     * 获取网关连接地址
     */
    async getGatewayUrl() {
        if (this.gatewayInfo?.url) {
            return this.gatewayInfo.url;
        }
        const gatewayInfo = await this.fetchGatewayInfo();
        this.gatewayInfo = gatewayInfo;
        return gatewayInfo.url;
    }
    /**
     * 获取完整的网关信息
     */
    async getGatewayInfo() {
        if (!this.gatewayInfo) {
            this.gatewayInfo = await this.fetchGatewayInfo();
        }
        return this.gatewayInfo;
    }
    /**
     * 从API获取新的访问令牌
     */
    async fetchNewToken() {
        const { appid, secret } = this.config;
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                this.bot.logger.debug(`[AUTH] 获取访问令牌，尝试次数: ${attempt}`);
                const tokenUrl = this.config.accessTokenUrl ?? Auth.DEFAULT_ACCESS_TOKEN_URL;
                const response = await this.bot.request.post(tokenUrl, {
                    appId: appid,
                    clientSecret: secret
                }, {
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'QQBot/1.0'
                    }
                });
                if (response.status === 200 && response.data?.access_token) {
                    const tokenInfo = {
                        access_token: response.data.access_token,
                        expires_in: response.data.expires_in,
                        expires_at: Date.now() + (response.data.expires_in * 1000)
                    };
                    this.bot.logger.debug("[AUTH] 访问令牌获取成功", {
                        expires_in: tokenInfo.expires_in,
                        expires_at: new Date(tokenInfo.expires_at).toISOString()
                    });
                    return tokenInfo;
                }
                else {
                    throw new Error(`无效的响应: ${response.status} ${JSON.stringify(response.data)}`);
                }
            }
            catch (error) {
                this.bot.logger.error(`[AUTH] 获取访问令牌失败 (尝试 ${attempt}/${this.config.maxRetries}):`, error);
                if (attempt === this.config.maxRetries) {
                    throw new Error(`获取访问令牌失败，已重试 ${this.config.maxRetries} 次: ${error}`);
                }
                // 等待后重试
                await this.delay(this.config.retryDelay * attempt);
            }
        }
        throw new Error("获取访问令牌失败");
    }
    /**
     * 从API获取网关信息
     */
    async fetchGatewayInfo() {
        const token = await this.getAccessToken();
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                this.bot.logger.debug(`[AUTH] 获取网关信息，尝试次数: ${attempt}`);
                const gatewayUrl = this.config.gatewayUrl ?? Auth.DEFAULT_GATEWAY_URL;
                const response = await this.bot.request.get(gatewayUrl, {
                    headers: {
                        Accept: "*/*",
                        "Accept-Encoding": "utf-8",
                        "Accept-Language": "zh-CN,zh;q=0.8",
                        Connection: "keep-alive",
                        "User-Agent": "v1",
                        Authorization: `QQBot ${token}`
                    },
                    timeout: 10000
                });
                if (response.data?.url) {
                    const gatewayInfo = {
                        url: response.data.url,
                        shards: response.data.shards,
                        session_start_limit: response.data.session_start_limit
                    };
                    this.bot.logger.debug("[AUTH] 网关信息获取成功", gatewayInfo);
                    return gatewayInfo;
                }
                else {
                    throw new Error(`无效的网关响应: ${JSON.stringify(response.data)}`);
                }
            }
            catch (error) {
                this.bot.logger.error(`[AUTH] 获取网关信息失败 (尝试 ${attempt}/${this.config.maxRetries}):`, error);
                if (attempt === this.config.maxRetries) {
                    throw new Error(`获取网关信息失败，已重试 ${this.config.maxRetries} 次: ${error}`);
                }
                await this.delay(this.config.retryDelay * attempt);
            }
        }
        throw new Error("获取网关信息失败");
    }
    /**
     * 设置令牌并启动自动刷新
     */
    setToken(tokenInfo) {
        const expiresAt = tokenInfo.expires_at ?? (Date.now() + tokenInfo.expires_in * 1000);
        this.currentToken = {
            ...tokenInfo,
            expires_at: expiresAt
        };
        this.refreshRetryCount = 0;
        this.scheduleTokenRefresh();
        this.bot.logger.info("[AUTH] 访问令牌已设置", {
            expires_in: tokenInfo.expires_in,
            expires_at: tokenInfo.expires_at ? new Date(tokenInfo.expires_at).toISOString() : 'unknown'
        });
    }
    /**
     * 计划令牌刷新
     */
    scheduleTokenRefresh() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        if (!this.currentToken) {
            return;
        }
        const expiresAt = this.currentToken.expires_at ?? (Date.now() + this.currentToken.expires_in * 1000);
        const remainingTokenLifetime = Math.max(expiresAt - Date.now(), Auth.MIN_REFRESH_DELAY_MS);
        // 计算刷新时间（提前缓冲时间刷新）
        const refreshTime = remainingTokenLifetime - (this.config.tokenRefreshBuffer * 1000);
        const fallbackRefreshTime = Math.max(Math.floor(remainingTokenLifetime * Auth.FALLBACK_REFRESH_RATIO), Auth.MIN_REFRESH_DELAY_MS);
        const nextRefreshTime = refreshTime > 0 ? refreshTime : fallbackRefreshTime;
        if (refreshTime <= 0) {
            this.bot.logger.warn(`[AUTH] 令牌剩余有效期(${remainingTokenLifetime}ms)小于等于刷新缓冲(${this.config.tokenRefreshBuffer * 1000}ms)，使用保底定时器 ${nextRefreshTime}ms`);
        }
        this.refreshTimer = setTimeout(async () => {
            try {
                this.bot.logger.debug("[AUTH] 自动刷新访问令牌");
                await this.refreshAccessToken();
            }
            catch (error) {
                this.bot.logger.error("[AUTH] 自动刷新令牌失败:", error);
                this.scheduleTokenRefreshRetry();
            }
        }, nextRefreshTime);
        this.bot.logger.debug(`[AUTH] 令牌刷新已计划，将在 ${nextRefreshTime / 1000} 秒后执行`);
    }
    scheduleTokenRefreshRetry() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        const maxRetries = this.config.maxRetries ?? 3;
        if (this.refreshRetryCount >= maxRetries) {
            this.bot.logger.error(`[AUTH] 自动刷新重试次数超过上限(${maxRetries})，停止自动重试`);
            this.refreshTimer = undefined;
            return;
        }
        this.refreshRetryCount += 1;
        this.refreshTimer = setTimeout(async () => {
            try {
                this.bot.logger.debug("[AUTH] 重试刷新访问令牌");
                await this.refreshAccessToken();
            }
            catch (error) {
                this.bot.logger.error("[AUTH] 重试刷新令牌失败:", error);
                this.scheduleTokenRefreshRetry();
            }
        }, Auth.REFRESH_RETRY_DELAY_MS);
    }
    /**
     * 检查当前令牌是否有效
     */
    isTokenValid() {
        if (!this.currentToken || !this.currentToken.expires_at) {
            return false;
        }
        // 检查是否在缓冲时间内即将过期
        const bufferTime = this.config.tokenRefreshBuffer * 1000;
        return Date.now() < (this.currentToken.expires_at - bufferTime);
    }
    /**
     * 获取当前令牌信息
     */
    getCurrentTokenInfo() {
        return this.currentToken ? { ...this.currentToken } : null;
    }
    /**
     * 检查认证状态
     */
    isAuthenticated() {
        return this.isTokenValid();
    }
    /**
     * 清除认证信息
     */
    clearAuth() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = undefined;
        }
        this.currentToken = undefined;
        this.gatewayInfo = undefined;
        this.bot.logger.debug("[AUTH] 认证信息已清除");
    }
    /**
     * 工具方法：延迟
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * 销毁认证管理器
     */
    destroy() {
        this.clearAuth();
        this.bot.logger.debug("[AUTH] 认证管理器已销毁");
    }
}
exports.Auth = Auth;
Auth.DEFAULT_ACCESS_TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken';
Auth.DEFAULT_GATEWAY_URL = '/gateway/bot';
Auth.MIN_REFRESH_DELAY_MS = 1000;
Auth.FALLBACK_REFRESH_RATIO = 0.5;
Auth.REFRESH_RETRY_DELAY_MS = 10000;
