# QQBot-Plugin

> 自用精简版 QQBot 适配器插件。基于时雨的原版 `Yunzai-QQBot-Plugin` 拆分二改，删除了管理指令和部分高级兼容功能。

## 说明

- 原作者：时雨
- 原项目地址：https://github.com/TimeRainStarSky/Yunzai-QQBot-Plugin
- 当前版本：自用精简 / 模块拆分版
- `index.js.bak`：拆分前的原单文件备份，仅用于对照，不参与运行

> 感谢原作者的开源贡献。本项目仅为个人自用修改版，如需完整功能和原版说明请参考原项目。

## 当前保留功能

- QQ 官方机器人适配到 Yunzai `Bot.adapter`
- 支持好友 / 群 / 频道 / 频道私聊消息事件
- 支持配置文件中的多个 QQBot 账号启动
- 支持 WebSocket 和 WebHook 模式
- 支持普通文本、图片、语音、Markdown、按钮等基础消息转换
- 支持消息撤回、pickFriend / pickGroup / pickMember 等适配器接口
- 支持 WebHook 验签路径 `/QQBot`

## 已删除 / 不再提供

为了自用精简，以下内容已移除：

- 管理指令模块 `apps/admin.js`
- `#QQBot账号`
- `#QQBot设置...`
- `#QQBot绑定用户...`
- 配置项 `permission`
- URL 自动转二维码功能
- Markdown 模板配置和 `#QQBotMarkdown...` 设置
- `toCallback` 配置分支
- 按钮绑定用户相关的跨 Bot 回调兼容逻辑
- 无用依赖 `qrcode`、`url-regex-safe`、`axios`、`form-data`

现在账号只通过配置文件维护，改完配置后重启 Yunzai 生效。

## 配置文件

配置文件位置：

```text
Yunzai/config/QQBot.yaml
```

默认配置大致如下：

```yaml
tips:
  - 欢迎使用 TRSS-Yunzai QQBot Plugin ! 作者：时雨🌌星空
  - 参考：https://github.com/TimeRainStarSky/Yunzai-QQBot-Plugin

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

## 配置项说明

| 配置项 | 说明 |
| --- | --- |
| `toBotUpload` | 发送图片 / 语音时，是否优先尝试通过已登录 Bot 上传 |
| `hideGuildRecall` | 撤回频道消息时是否隐藏 |
| `imageLength` | Markdown 图片压缩上限，单位 MB；设为 `0` 表示不压缩 |
| `bot.sandbox` | 是否使用 QQBot 沙箱环境 |
| `bot.maxRetry` | qq-group-bot 请求最大重试次数 |
| `bot.timeout` | qq-group-bot 请求超时时间，单位毫秒 |
| `token` | QQBot 账号配置列表 |

## Token 格式

```text
机器人QQ号:appid:token:secret:群/私聊事件开关:频道事件开关
```

示例：

```yaml
token:
  - 123456789:102000000:你的token:你的secret:1:0
```

最后两个开关说明：

| 位置 | 值 | 说明 |
| --- | --- | --- |
| 第 5 段 | `0` | 不启用群 / 私聊事件 |
| 第 5 段 | `1` | 启用群 / 私聊事件，即 `GROUP_AT_MESSAGE_CREATE`、`C2C_MESSAGE_CREATE` |
| 第 5 段 | `2` | 使用 WebHook 模式 |
| 第 6 段 | `0` | 使用公开频道事件 `PUBLIC_GUILD_MESSAGES` |
| 第 6 段 | `1` | 使用私域频道事件 `GUILD_MESSAGES` |

## WebHook 说明

插件会注册以下 WebHook 路径：

```text
/QQBot
```

当 token 第 5 段为 `2` 时使用 WebHook 模式，需要在 QQ 开放平台后台配置回调地址，例如：

```text
http://你的域名或IP:端口/QQBot
```

平台发起验签请求时，插件会根据配置中的 `secret` 自动生成并返回签名。

## 依赖说明

当前 `package.json` 只保留运行中直接需要的依赖：

- `qq-group-bot`
- `silk-wasm`
- `image-size`
- `tweetnacl`
- `ulid`

`sharp` 为可选依赖：如果环境里有 `sharp`，会用于压缩超限图片；没有则跳过压缩。

## 目录结构

```text
QQBot-Plugin
├── lib
│   ├── client.js      # QQBot 连接、事件处理、回调处理
│   ├── config.js      # 配置读取
│   ├── converter.js   # 消息转换
│   └── utils.js       # 工具函数
├── index.js           # 插件入口 / 适配器主体
├── index.js.bak       # 拆分前备份，不参与运行
├── package.json       # 依赖信息
└── README.md          # 项目说明
```

## 注意事项

- 本版本没有任何 `#QQBot...` 管理命令。
- 添加、删除、修改账号都需要直接编辑 `Yunzai/config/QQBot.yaml`。
- 修改账号配置后建议重启 Yunzai。
- `index.js.bak` 只是备份文件，如果不需要对照也可以自行移走。

## 免责声明

本项目为基于原项目拆分后的二改自用版本，仅供学习交流和个人使用参考。使用 QQ 官方机器人能力时，请遵守 QQ 开放平台相关规则与协议。因使用本插件造成的问题需由使用者自行承担。
