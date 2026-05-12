# QQBot-Plugin

> 纯 AI 辅助编写 / 整理，如遇问题可先自行排查日志，或将报错信息提交给 AI / 开发者协助分析。(没错这个也是ai写的)

## 说明

本项目是基于原项目进行拆分二改的 QQBot 适配器插件

- 原作者：时雨
- 原项目地址：https://github.com/TimeRainStarSky/Yunzai-QQBot-Plugin
- 当前项目：基于原项目进行模块拆分、结构调整与二次修改
- index.js.bak 是拆分时候的文件

> 感谢原作者的开源贡献。本项目仅为二改拆分版本，如需完整原版说明请优先参考原项目。

## 功能简介

参考源项目

## 环境要求

参考源项目

## 配置说明


配置文件在 `Yunzai/config/QQBot.yaml` 下
默认配置项包括：

```js
tips:
  - 欢迎使用 TRSS-Yunzai QQBot Plugin ! 作者：时雨🌌星空
  - 参考：https://github.com/TimeRainStarSky/Yunzai-QQBot-Plugin
permission: master
toBotUpload: true
hideGuildRecall: false
imageLength: 3
bot:
  sandbox: false
  maxRetry: .inf
  timeout: 30000
token: 
- 机器人QQ号:appid:token:secret:群/私聊事件开关:频道事件开关
```

### 主要配置项

| 配置项 | 说明 |
| --- | --- |
| `permission` | 管理指令权限，默认 `master` |
| `toBotUpload` | 是否上传到 Bot 侧处理 |
| `hideGuildRecall` | 频道撤回时是否隐藏 |
| `imageLength` | 图片相关处理长度配置 |
| `bot.sandbox` | 是否使用沙箱环境 |
| `bot.maxRetry` | 最大重试次数 |
| `bot.timeout` | 请求超时时间 |
| `token` | QQBot 账号配置列表 |

## Token 格式

添加账号时使用以下格式：

```text
- 机器人QQ号:appid:token:secret:群/私聊事件开关:频道事件开关
```

示例：

```text
- 123456789:102000000:你的token:你的secret:1:0
```

最后两个开关说明：

| 位置 | 值 | 说明 |
| --- | --- | --- |
| 第 5 段 | `0` | 不启用群 / 私聊事件 |
| 第 5 段 | `1` | 启用群 / 私聊事件，即 `GROUP_AT_MESSAGE_CREATE`、`C2C_MESSAGE_CREATE` |
| 第 6 段 | `0` | 使用 `公开频道 PUBLIC_GUILD_MESSAGES` |
| 第 6 段 | `1` | 使用 `私人频道 GUILD_MESSAGES` |

## 目录结构

```text
QQBot-Plugin
├── lib
│   ├── client.js      # QQBot 连接与事件处理
│   ├── config.js      # 配置管理
│   ├── converter.js   # 消息转换
│   └── utils.js       # 工具函数
├── index.js           # 插件入口
├── index.js.bak       # 原项目插件备份
├── package.json       # 依赖信息
└── README.md          # 项目说明
```

## 免责声明

本项目为基于原项目拆分后的二改版本，仅供学习交流和自用参考。使用 QQ 官方机器人能力时，请遵守 QQ 开放平台相关规则与协议。因使用本插件造成的问题需由使用者自行承担。
