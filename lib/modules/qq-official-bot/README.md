# 内置 qq-official-bot SDK

本目录是 QQBot-Plugin 内置的 `qq-official-bot` SDK 运行快照，不是独立开发目录。

## 来源

- 项目名称：`qq-official-bot`
- 内置版本：`1.2.3-dndss.1`
- 上游仓库：https://github.com/dndss/qq-official-bot
- 开源协议：MIT，详见同目录下的 `LICENSE`

## 目录内容

- `lib/`：由 SDK TypeScript 源码编译生成的 JavaScript 运行产物和类型声明
- `package.json`：本地模块入口、导出和运行环境声明
- `LICENSE`：上游项目的 MIT 许可证

为控制插件体积，本目录不包含 SDK 的源码、开发依赖、文档站点和
`node_modules`。
