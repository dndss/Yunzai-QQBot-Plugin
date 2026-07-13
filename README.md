# QQBot-Plugin

> 基于 [Yunzai-QQBot-Plugin](https://github.com/TimeRainStarSky/Yunzai-QQBot-Plugin) 拆分二改的 QQ 官方 Bot 适配器插件。

## 项目说明

本插件用于让 Yunzai 接入 QQ 官方 Bot 能力，将 QQBot 的私聊、群聊、频道事件转换为 Yunzai 可处理的事件，并把 Yunzai 的消息段转换为 QQBot 可发送的消息格式。

- 原作者：时雨
- 原项目：https://github.com/TimeRainStarSky/Yunzai-QQBot-Plugin
- 当前版本：在原项目基础上进行模块拆分、结构调整与功能补充
- `wiki.md`：整理了按钮、Markdown 等 QQBot 消息组件用法

> 感谢原作者的开源贡献。本项目为二改拆分版本，遇到与原版差异时请以当前项目代码为准。

## 功能简介

- 接入 QQ 官方 Bot 私聊、群聊、频道消息事件
- 支持 Yunzai 常用消息段到 QQBot 消息的转换
- 支持文本、图片、Markdown、按钮等消息发送
- 支持 `openid` 与真实 QQ 号的绑定映射
- 支持 QQBot 群 `openid` 与真实群号的绑定映射
- 支持从群消息事件中提取成员名称与身份信息
- 支持扫码登录添加 QQBot 配置
- 支持频道、群聊、私聊的基础撤回与发送能力

## 环境要求

- 已安装并可正常运行 Yunzai / TRSS-Yunzai
- Node.js 环境需满足当前 Yunzai 运行要求
- Redis 需正常可用，用户与群映射会写入 Redis
- QQ 官方 Bot 需要已在 QQ 开放平台创建并具备对应事件权限

## 安装依赖

进入插件目录后安装依赖：

```bash
cd plugins/QQBot-Plugin
npm install
```

如果 `sharp` 安装失败，请根据当前系统环境检查 Node.js 版本、网络源、编译环境或预编译包下载情况。

## 配置文件

配置文件位于：

```text
Yunzai/config/QQBot.yaml
```

首次启动后会自动生成默认配置，默认配置大致如下：

```yaml
tips:
  - 欢迎使用 TRSS-Yunzai QQBot Plugin ! 作者：时雨🌌星空
  - 参考：https://github.com/TimeRainStarSky/Yunzai-QQBot-Plugin
permission: master
toBotUpload: true
hideGuildRecall: false
imageLength: 3
markdownImage: false
bot:
  sandbox: false
  maxRetry: 10
  timeout: 30000
token: []
```

### 配置项说明

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `permission` | `master` | 管理指令权限 |
| `toBotUpload` | `true` | 是否上传到 Bot 侧处理 |
| `hideGuildRecall` | `false` | 频道撤回时是否隐藏相关提示 |
| `imageLength` | `3` | 图片上传时压缩的最大大小 单位MB |
| `markdownImage` | `false` | 是否将普通图片消息段自动转换为 Markdown 图片。默认使用原生图片独立发送，避免本地图片缺少可访问图床 URL 导致 Markdown 图片不可用 |
| `bot.sandbox` | `false` | 是否使用 QQBot 沙箱环境 |
| `bot.maxRetry` | `10` | QQBot 请求最大重试次数 |
| `bot.timeout` | `30000` | QQBot 请求超时时间，单位毫秒 |


## 添加 Bot 账号

### 方式一：扫码登录

推荐使用扫码方式自动写入配置：控制台发送
```text
#QQbot扫码登录
```

说明：

- 二维码有效期约 1 分钟
- 扫码成功后会自动写入 `QQBot.yaml`
- 配置写入后通常需要重启 Yunzai 生效

### 方式二：手动配置 Token

也可以手动编辑 `QQBot.yaml` 的 `token` 列表：

```yaml
token:
  - 机器人QQ号:appid:token:secret:群私聊事件开关:频道事件开关
```

示例：

```yaml
token:
  - 123456789:102000000:你的token:你的secret:1:0
```

字段说明：

| 位置 | 字段 | 说明 |
| --- | --- | --- |
| 第 1 段 | 机器人 QQ 号 | 当前 QQBot 对应的机器人 QQ 号 |
| 第 2 段 | `appid` | QQ 开放平台应用 AppID |
| 第 3 段 | `token` | QQBot Token |
| 第 4 段 | `secret` | QQBot Secret |
| 第 5 段 | 群私聊事件开关 | `1` 启用群聊/私聊事件，`0` 不启用 |
| 第 6 段 | 频道事件开关 | `0` 使用公开频道事件，`1` 使用私域频道事件 |

第 5 段启用后主要处理：

- `GROUP_AT_MESSAGE_CREATE`
- `C2C_MESSAGE_CREATE`

第 6 段说明：

- `0`：使用公开频道 `PUBLIC_GUILD_MESSAGES`
- `1`：使用私域频道 `GUILD_MESSAGES`

## 常用命令

| 命令 | 权限 | 使用场景 |
| --- | --- | --- |
| `#QQbot扫码登录` | `master` | 扫码授权并自动写入 Bot 配置 |
| `#QQ绑定` | QQBot 私聊/群聊用户 | 查看 QQ 号绑定提示 |
| `#QQ绑定123456789` | QQBot 私聊/群聊用户 | 将当前 QQBot `openid` 绑定到真实 QQ 号 |
| `#QQ绑定@某人 123456789` | `master` | 校验被 @ 用户头像后代为绑定 |
| `#QQ强制绑定@某人 123456789` | `master` | 跳过头像校验，直接为被 @ 用户绑定 |
| `#QQ绑定openid <openid> 123456789` | `master` | 校验指定 `openid` 的头像后直接绑定 |
| `#QQ强制绑定openid <openid> 123456789` | `master` | 跳过头像校验，直接绑定指定 `openid` |
| `#群绑定` | `master` | 查看当前群绑定状态或绑定提示 |
| `#群绑定123456789` | `master` | 将当前 QQBot 群 `openid` 绑定到真实群号 |

## 绑定说明

QQ 官方 Bot 事件中通常拿到的是 `openid`，不是传统 QQ 号或群号。为了兼容依赖真实 QQ 号/群号的 Yunzai 插件，本插件提供了绑定映射能力。

### 用户绑定

用户在 QQBot 私聊或群聊中发送：

```text
#QQ绑定123456789
```

插件会通过头像 MD5 对比校验当前 `openid` 与真实 QQ 号是否一致，校验通过后写入映射。

群聊中，已完成自身 QQ 绑定的 `master` 可以代其他用户绑定：

```text
#QQ绑定@某人 123456789
```

普通代绑定会校验被 @ 用户头像。头像无法匹配时，`master` 可以明确使用强制命令：

```text
#QQ强制绑定@某人 123456789
```

强制代绑定会跳过头像校验，请确认 QQ 号和被 @ 用户无误后再使用。每次只能指定一名用户。

无法 @ 到目标用户，但已经从日志等位置取得其 `openid` 时，可以直接指定 32 位 `openid`：

```text
#QQ绑定openid A1B2C3D4E5F60718293A4B5C6D7E8F90 123456789
```

普通 OPENID 绑定仍会校验目标头像。需要跳过头像校验时使用：

```text
#QQ强制绑定openid A1B2C3D4E5F60718293A4B5C6D7E8F90 123456789
```

这两条命令仅限 `master` 使用，同时支持 QQBot 私聊和群聊。

### 群绑定

群内 `master` 发送：

```text
#群绑定123456789
```

绑定成功后，当前 QQBot 群 `openid` 会映射为真实群号。

## 群成员信息

QQ 官方当前不提供单个群成员详情查询接口，插件直接使用群消息事件中的 `author` 字段：

- `author.username` 封装为 `sender.nickname`
- `author.member_role` 同步为 `role`、`member_role`、`is_owner` 和 `is_admin`
- `author.bot` 和 `author.union_openid` 直接保留到 `sender`
- 事件未提供 `sender.card`、`joined_at` 或 `join_time` 时，插件不会自行补造

插件使用维护版 `qq-official-bot` SDK，并将依赖锁定到经过验证的提交。


## 目录结构

```text
QQBot-Plugin
├── app
│   ├── bind.js        # 用户 QQ 号绑定命令
│   ├── groupBind.js   # 群号绑定命令
│   └── qrlogin.js     # 扫码登录命令
├── lib
│   ├── client.js      # QQBot 连接与事件转发
│   ├── config.js      # 配置加载与保存
│   ├── converter.js   # 消息段转换
│   ├── groupMap.js    # 群 openid 与真实群号映射
│   ├── qrlogin.js     # 扫码登录实现
│   ├── uinMap.js      # 用户 openid 与真实 QQ 号映射
│   └── utils.js       # 通用工具函数
├── index.js           # 适配器入口
├── package.json       # 依赖信息
├── README.md          # 项目说明
└── wiki.md            # 消息组件示例文档
```

## 消息组件

按钮、Markdown、Markdown + 按钮混合发送等示例请查看：

```text
plugins/QQBot-Plugin/wiki.md
```

常见写法示例：

```js
await e.reply(segment.button([
  { text: "确认", callback: "#确认" },
  { text: "取消", callback: "#取消" }
]))
```

## 已知限制


- 用户映射、群映射依赖 Redis 与本地 JSON 持久化
- QQ 官方 Bot 能力受开放平台权限、事件订阅、沙箱/正式环境影响
- 部分普通 Yunzai 插件可能默认依赖真实 QQ 号，需要先完成用户或群绑定
- 当前项目为二改拆分版本，部分行为可能与原项目不完全一致

## 免责声明

本项目为基于原项目拆分后的二改版本，仅供学习交流和自用参考。使用 QQ 官方机器人能力时，请遵守 QQ 开放平台相关规则与协议。因使用本插件造成的问题需由使用者自行承担。
