# QQBot 消息组件 Wiki

本文档整理 QQBot 常用消息组件示例，包括按钮、Markdown、以及 Markdown + 按钮混合发送。

## 按钮组件

按钮一般通过 `segment.button()` / `dmsegment.button()` 创建。一个按钮对象通常包含显示文本、点击后的文本、按钮动作、权限和高级配置等字段。

### 按钮写法说明

`button()` 支持以下几种写法：

```js
// 单个按钮
segment.button({ text: "确认", callback: "#确认" })

// 一行多个按钮
segment.button([
  { text: "确认", callback: "#确认" },
  { text: "取消", callback: "#取消" }
])

// 多行按钮：推荐写法，每个参数是一行
segment.button(
  [{ text: "确认", callback: "#确认" }],
  [{ text: "取消", callback: "#取消" }]
)

// 二维数组写法，也兼容
segment.button([
  [{ text: "确认", callback: "#确认" }],
  [{ text: "取消", callback: "#取消" }]
])
```



### 基础示例

```js
await e.reply(segment.button(
  [
    { text: "确认", callback: "确认操作" },
    { text: "取消", callback: "取消操作" }
  ]
))
```

### 按钮参数说明

| 参数 | 类型 | 是否必填 | 默认值 | 作用 |
| --- | --- | --- | --- | --- |
| `text` | `string` | 必填 | 无 | 按钮显示文字。 |
| `clicked_text` | `string` | 可选，仅 `callback` 回调按钮可用 | 不显示点击后文字 / 由 QQ 客户端默认处理 | 回调按钮点击后显示的文字，`input` / `link` 按钮不生效。 |
| `callback` | `string` | 三选一 | 无 | 回调按钮，点击后把内容作为回调/指令交给机器人处理。 |
| `input` | `string` | 三选一 | 无 | 输入按钮，点击后把内容自动填入输入框。 |
| `link` | `string` | 三选一 | 无 | 链接按钮，点击后打开指定链接。 |
| `send` | `boolean` | 可选 | 不填，等同于 `false` | 输入按钮参数。私聊可使用 `true` 自动发送；群聊必须使用 `false` 或不填，表示只填充到输入框，由用户确认发送。 |
| `permission` | `string \| string[]` | 可选 | 不填，所有人可点击 | 按钮点击权限控制。 |
| `QQBot.render_data` | `object` | 可选 | `{}` | 高级显示配置，可覆盖按钮显示文字、点击后文字、样式等。 |
| `QQBot.action` | `object` | 可选 | `{}` | 高级动作配置，可覆盖 QQBot 原始 action 字段。 |

### 按钮类型

一个按钮通常三选一使用：`callback`、`input`、`link`。

#### callback 回调按钮

```js
{
  text: "签到",
  clicked_text: "已签到",
  callback: "#签到"
}
```

点击后会把 `callback` 的内容交给机器人处理。

#### input 输入按钮

```js
{
  text: "输入查询",
  input: "#查询",
  send: false
}
```

点击后会把 `input` 内容填入用户输入框。

> 注意：`send` 请使用布尔值，不要写字符串 `"true"` / `"false"`。
>
> - 私聊：可以使用 `send: true`，点击后可自动发送。
> - 群聊：必须使用 `send: false` 或留空不填，点击后只会把内容填充到输入框，由用户手动确认发送；`send: true` 在群聊会被拦截，无法发送。

#### link 链接按钮

```js
{
  text: "打开官网",
  link: "https://www.qq.com"
}
```

点击后打开指定链接。

## permission 权限

`permission` 用来限制谁可以点击按钮。

| 写法 | 效果 |
| --- | --- |
| 不写 | 所有人都可以点击。 |
| `"admin"` | 仅管理员可以点击。 |
| `"master"` | 仅当前 Bot 配置的主人可以点击。 |
| `"123456789"` | 仅指定用户 ID 可以点击。 |
| `["123456789", "987654321"]` | 仅指定用户 ID 列表可以点击。 |

`"master"` 会读取当前 Bot 的主人数组。数组中的 QQ 号会通过 UIN 映射转换为
`openid`，已经是 `openid` 的值则会原样使用。

示例：

```js
segment.button(
  [
    {
      text: "管理员操作",
      callback: "#管理操作",
      permission: "admin"
    },
    {
      text: "主人操作",
      callback: "#主人操作",
      permission: "master"
    },
    {
      text: "仅你可点",
      callback: "#个人操作",
      permission: e.user_id
    }
  ]
)
```

## style 按钮样式

按钮样式默认会自动在 `0` 和 `1` 之间交替，一般不需要手动传。

| style | 效果 |
| --- | --- |
| `0` | 灰色按钮。 |
| `1` | 蓝色按钮。 |

如果需要固定颜色，可以通过 `QQBot.render_data.style` 覆盖：

```js
{
  text: "确认",
  callback: "#确认",
  QQBot: {
    render_data: {
      style: 1
    }
  }
}
```

## QQBot.render_data 是什么

`QQBot.render_data` 是 QQ 官方按钮协议里的显示数据字段，用来控制按钮显示效果。

普通回调按钮：

```js
{
  text: "点我",
  clicked_text: "已点击",
  callback: "#测试"
}
```

> 注意：`clicked_text` / `visited_label` 仅回调按钮可用，`input` 输入按钮和 `link` 链接按钮不生效。

会自动转换成类似：

```js
render_data: {
  label: "点我",
  visited_label: "已点击",
  style: 0
}
```

如果写了 `QQBot.render_data`，就可以覆盖或补充这些显示字段。

常见字段：

| 字段 | 作用 |
| --- | --- |
| `label` | 按钮显示文字，会覆盖 `text`。 |
| `visited_label` | 点击后的按钮文字，会覆盖 `clicked_text`，仅 `callback` 回调按钮可用。 |
| `style` | 按钮样式，`0` 灰色，`1` 蓝色。 |

示例：

```js
{
  text: "普通文字",
  clicked_text: "已点",
  callback: "#测试",
  QQBot: {
    render_data: {
      label: "实际显示这个",
      visited_label: "点完显示这个",
      style: 1
    }
  }
}
```

实际效果：

- 按钮显示：`实际显示这个`
- 点击后显示：`点完显示这个`
- 按钮颜色：蓝色

一般情况下不需要写 `QQBot.render_data`，只有需要覆盖 QQBot 原始显示参数时再使用。

## 完整按钮示例

```js
await e.reply(segment.button(
  [
    {
      text: "签到",
      clicked_text: "已签到",
      callback: "#签到",
      permission: e.user_id,
      QQBot: {
        render_data: {
          style: 1
        }
      }
    },
    {
      text: "打开官网",
      link: "https://www.qq.com"
    }
  ],
  [
    {
      text: "填入查询",
      input: "#查询",
      send: false
    },
    {
      text: "管理员按钮",
      callback: "#管理",
      permission: "admin"
    }
  ]
))
```

## Markdown 组件

Markdown 一般通过 `segment.markdown()` 创建，用来发送 QQBot Raw Markdown 消息。
> 注意 发送文本消息 插件默认转为markdown消息发送


基础写法：

```js
await e.reply(segment.markdown("# 标题\n这是正文"))
```

也可以直接传入对象，用于发送更接近 QQBot 原始协议的 Markdown 数据：

```js
await e.reply(segment.markdown({
  content: "# 标题\n这是正文"
}))
```

### Markdown 写法说明

| 写法 | 说明 |
| --- | --- |
| `segment.markdown("内容")` | 最常用写法，直接发送 Raw Markdown 文本。 |
| `segment.markdown({ content: "内容" })` | 对象写法，可自行传入 Markdown 消息字段。 |

> 提示：插件在 Raw Markdown 模式下会把普通文本、图片、@、文件等尽量拼接进 Markdown 内容中。

### 完整 Markdown 示例

```js
await e.reply(segment.markdown(`# 一号标题
## 二号标题
这是正文示例，演示普通文本段落。  

# 文字样式
**加粗**  
__下划线加粗__  
_斜体_  
*星号斜体*  
***加粗斜体***  
~~删除线~~  

# 链接
欢迎来到：[🔗腾讯网](https://www.qq.com)  
文档可以访问 <https://doc.qq.com>  

# 图片
![示例图片 #208px #320px](https://resource5-1255303497.cos.ap-guangzhou.myqcloud.com/abcmouse_word_watch/markdown/building.png)

# 有序列表
1. 新人降落桃源岛的欢迎仪式
2. 阳光准则助力建设有温度的频道
3. 岛民分享吹水纳凉

# 无序列表
- 新人降落桃源岛的欢迎仪式
- 阳光准则助力建设有温度的频道
- 岛民分享吹水纳凉

# 列表嵌套
1. 嵌套一层
    - 列表前是普通文本，需要空行隔开，否则无法识别
    - 二级无序列表
2. 嵌套二层
    1. 二级有序列表，需要缩进 4 个空格
    2. 可以嵌套无序列表
        - 嵌套三级无序列表
        - 支持有限深度嵌套

# 块引用
> 青青子衿，悠悠我心，但为君故，沉吟至今  
> 四月维夏，六月徂暑。先祖匪人，胡宁忍予  
> 秋日凄凄，百卉具腓。乱离瘼矣，爰其适归？  
诗经《小雅》

# 水平分割线
这是段落1
***
这是段落2

# 表格示例
| 姓名 | 年龄 | 城市 |
|------|------|------|
| 张三 | 18 | 北京 |

# 代码块
\`\`\`javascript
console.log("Hello");
\`\`\`
`))
```

### Markdown 支持内容参考

| 类型 | 示例 | 说明 |
| --- | --- | --- |
| 标题 | `# 一级标题` / `## 二级标题` | 支持多级标题，建议不要过深。 |
| 普通文本 | `这是正文` | 普通段落文本。 |
| 换行 | 行尾两个空格或空一行 | Markdown 中单个换行可能不会显示为换行。 |
| 加粗 | `**加粗**` | 强调文字。 |
| 斜体 | `_斜体_` / `*斜体*` | 倾斜文字。 |
| 加粗斜体 | `***加粗斜体***` | 同时加粗和斜体。 |
| 删除线 | `~~删除线~~` | 删除线样式。 |
| 链接 | `[文本](https://www.qq.com)` | 点击跳转链接。 |
| 自动链接 | `<https://doc.qq.com>` | 直接展示可点击链接。 |
| 图片 | `![描述 #宽px #高px](图片地址)` | QQBot Markdown 图片建议携带宽高。 |
| 有序列表 | `1. 内容` | 数字列表。 |
| 无序列表 | `- 内容` | 符号列表。 |
| 嵌套列表 | 缩进 4 个空格 | 嵌套层级有限，过深可能显示异常。 |
| 引用 | `> 引用内容` | 块引用。 |
| 分割线 | `***` | 水平分割线。 |
| 表格 | Markdown 表格 | 客户端支持情况可能不一致。 |
| 代码块 | 三个反引号包裹 | 可指定语言，如 `javascript`。 |

### Markdown 图片

你可以手写 Markdown 图片：

```md
![示例图片 #208px #320px](https://example.com/image.png)
```

也可以使用普通图片消息段，让插件自动转换为 Markdown 图片：

```js
await e.reply([
  segment.markdown("# 图片示例\n"),
  segment.image("https://example.com/image.png")
])
```

插件会尝试转换为类似：

```md
![图片 #宽度px #高度px](图片地址)
```

默认情况下，普通图片消息段会作为原生图片独立发送，避免本地图片缺少可访问图床 URL 导致 Markdown 图片不可用。

如果希望普通图片消息段继续自动转换为 Markdown 图片，可以在 `QQBot.yaml` 中设置：

```yaml
markdownImage: true
```

设置为 `true` 后，插件会将 `segment.image(file)` 转换为 Markdown 图片；保持默认 `false` 时，消息中的普通文本 / Markdown 会继续合并为 Markdown 消息，`segment.image(file)` 会作为独立原生图片消息发送。

如果无法识别图片宽高，可能会显示为 `#0px #0px`，一般建议尽量使用可访问的公网图片地址。

### @ 用户与 @全体

在 Raw Markdown 中，插件会把 `segment.at()` 转换为 QQBot 的 @ 标签：

```js
await e.reply([
  segment.at(e.user_id),
  segment.markdown(" 你好")
])
```

@ 全体：

```js
await e.reply([
  segment.at("all"),
  segment.markdown(" 全体成员请注意")
])
```

转换后大致为：

```md
<qqbot-at-user id="用户ID" />
<qqbot-at-everyone />
```

> 注意：是否能 @全体 取决于机器人权限、群/频道权限以及 QQ 官方限制。

### Markdown 注意事项

- Raw Markdown 内容不要过长，过长可能被 QQ 官方接口拒绝或客户端显示不完整。
- 部分 Markdown 语法在不同 QQ 客户端显示效果可能不一致。
- 链接和图片地址建议使用 `https://` 公网可访问地址。
- 图片 Markdown 建议写明尺寸：`![描述 #宽px #高px](url)`。
- 文本中的 `@`、`<qqbot-` 等特殊内容，插件会做基础转义，避免误触发 QQBot 标签。
- 如果需要连续换行，可以使用空行，或在行尾添加两个空格。

## Markdown + 按钮混合发送

Markdown 可以和按钮一起发送。插件会优先把按钮挂到 Markdown 消息后面。

### 基础混合示例

```js
await e.reply([
  segment.markdown(`# 操作面板
请选择一个操作：`),
  segment.button(
    [
      { text: "签到", clicked_text: "已签到", callback: "#签到" },
      { text: "查询", input: "#查询", send: false }
    ],
    [
      { text: "官网", link: "https://www.qq.com" },
      { text: "管理员", callback: "#管理", permission: "admin" }
    ]
  )
])
```

### 多个 Markdown 与按钮

```js
await e.reply([
  segment.markdown("# 第一段\n这里是第一段内容。"),
  segment.markdown("# 第二段\n这里是第二段内容。"),
  segment.button([
    { text: "确认", callback: "#确认" },
    { text: "取消", callback: "#取消" }
  ])
])
```

处理规则：

- 如果消息里已有 Markdown，按钮会尽量追加到 Markdown 消息后。
- 单条 Markdown 消息最多会追加有限数量的按钮行；按钮过多时，插件会自动拆成多条 Markdown + 按钮消息。
- 如果只有按钮没有 Markdown，插件会自动补一个空 Markdown 内容用于承载按钮。


