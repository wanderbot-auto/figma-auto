# 功能与用法

`figma-auto` 是一个本地 Figma MCP 桥接项目，用来把外部 MCP 客户端的请求转发到正在运行的 Figma 本地插件。

## 项目组成

- `packages/protocol`: 协议常量、类型、Zod 校验
- `apps/mcp-bridge`: MCP stdio 服务 + 本地 WebSocket bridge
- `apps/figma-plugin`: Figma 插件运行时，实际执行读写操作
- `apps/bridge-manager-macos`: 可选的 macOS 菜单栏管理器，用来管理多个 bridge 实例

## 当前功能

### 会话与状态

- `figma.get_session_status`
- `figma.ping`

### 读取能力

- 文件、页面、当前页面、原型 flow
- 当前选区、单节点、节点树
- 节点搜索
- 样式、组件、变量读取

对应工具：

- `figma.get_file`
- `figma.get_current_page`
- `figma.get_flow`
- `figma.get_selection`
- `figma.list_pages`
- `figma.get_node`
- `figma.get_node_tree`
- `figma.find_nodes`
- `figma.get_styles`
- `figma.get_components`
- `figma.get_variables`

### 写入能力

- 节点重命名
- 页面、Frame、Rectangle、Component、Instance、Text 创建
- 节点复制、移动、删除
- 文本修改
- 样式应用
- 节点属性更新
- Instance properties 更新
- 图片填充
- Prototype reactions 设置

对应工具：

- `figma.rename_node`
- `figma.create_page`
- `figma.create_frame`
- `figma.create_rectangle`
- `figma.create_component`
- `figma.create_instance`
- `figma.create_text`
- `figma.duplicate_node`
- `figma.set_text`
- `figma.apply_styles`
- `figma.update_node_properties`
- `figma.set_instance_properties`
- `figma.set_image_fill`
- `figma.set_reactions`
- `figma.move_node`
- `figma.delete_node`

### 批处理与高阶能力

- `figma.batch_edit`: 旧版批处理接口
- `figma.batch_edit_v2`: 主批处理引擎，支持 `opId` 引用前一步结果
- `figma.normalize_names`: 批量规范化命名
- `figma.create_spec_page`: 生成说明页
- `figma.extract_design_tokens`: 提取设计令牌

### 变量能力

- `figma.create_variable_collection`
- `figma.create_variable`
- `figma.bind_variable`

## 重要限制

- 当前只支持单个活跃插件会话
- 当前只支持 `figma` editor，不支持 FigJam
- `find_nodes.limit` 默认 `50`，最大 `200`
- `batch_edit` 最大 `10` 个操作
- `batch_edit_v2` 最大 `25` 个操作
- 删除或提交式修改要求 `confirm: true`
- 归一化 paint 目前只覆盖 `SOLID` 和 `IMAGE`
- 变量和样式能力仅限当前 Figma 文件

## 推荐用法

### 方式一：作为 MCP 服务接入客户端

这是最实际的用法。流程如下：

1. 在仓库根目录安装依赖并构建：

```bash
npm install
npm run build
```

2. 在 Figma Desktop 中导入本地插件清单：

- 默认清单：`apps/figma-plugin/manifest.json`

3. 在目标 Figma 文件中运行这个插件，让插件先连上本地 bridge。

4. 在你的 MCP 客户端里有两种接法。

方式 A：让客户端自己启动 bridge，按 stdio server 配置：

```json
{
  "mcpServers": {
    "figma-auto": {
      "command": "node",
      "args": [
        "/Users/wander/Documents/code/apps/figma-auto/apps/mcp-bridge/dist/index.js"
      ],
      "env": {
        "FIGMA_AUTO_BRIDGE_HOST": "localhost",
        "FIGMA_AUTO_BRIDGE_PORT": "4318",
        "FIGMA_AUTO_BRIDGE_PUBLIC_WS_URL": "ws://localhost:4318",
        "FIGMA_AUTO_BRIDGE_PUBLIC_HTTP_URL": "http://localhost:4318",
        "FIGMA_AUTO_BRIDGE_LOG_PATH": "/Users/wander/Documents/code/apps/figma-auto/logs/bridge.log",
        "FIGMA_AUTO_AUDIT_LOG_PATH": "/Users/wander/Documents/code/apps/figma-auto/logs/audit.ndjson"
      }
    }
  }
}
```

方式 B：如果 bridge 已经由菜单栏 app 或你自己的进程启动好了，直接把客户端连到远程 MCP endpoint：

```toml
[mcp_servers.figma_auto_bridge]
url = "http://localhost:4318/mcp"
```

5. 先调用 `figma.get_session_status`。返回 `connected: true` 以后，再开始读写文件。

说明：

- `apps/mcp-bridge/dist/index.js` 是真正的 MCP bridge 进程入口。
- 如果客户端用 stdio 模式，它会自己启动这个进程。
- 如果 bridge 已经在跑，客户端应该连 `http://localhost:<port>/mcp`，不要再重复启动同一个端口上的 bridge。

### 方式二：本地调试 bridge 和插件

如果只是本地验证构建和连接链路，用下面几条命令：

```bash
npm install
npm run build
npm run start:local
```

常用辅助命令：

- `npm run dev:bridge`: 跳过构建，直接启动 bridge
- `npm run build:bridge`: 只构建协议包和 bridge
- `npm run build:plugin`: 只构建插件
- `npm run paths:local`: 打印当前 manifest、日志、端口等路径配置
- `npm test`: 跑现有自动化测试

## 多实例用法

如果你想让两个客户端分别控制两个不同的 Figma 文件，可以给 bridge 和插件各自生成独立实例：

```bash
npm run start:local -- --instance marketing --port 4401
npm run start:local -- --instance product --port 4402
```

每个实例会生成独立插件清单：

- `apps/figma-plugin/instances/marketing/manifest.json`
- `apps/figma-plugin/instances/product/manifest.json`

你需要把对应 manifest 分别导入 Figma，并在对应文件里运行对应实例。

## macOS 菜单栏管理器

如果你在 macOS 上需要长期管理多个本地实例，可以直接运行：

```bash
cd apps/bridge-manager-macos
swift run
```

它会负责：

- 保存 bridge 实例列表
- 启停多个 bridge 进程
- 自动生成对应实例的插件 bundle 和 manifest
- 打开 manifest 与日志目录
- 让你可以把 Codex 配到 `http://localhost:<实例端口>/mcp`

## 常见问题

### `missing_session`

通常表示插件没有运行、插件没连上 bridge，或者当前活跃 session 被别的插件实例替换了。

### 改了端口或 URL 后不生效

插件里的 bridge 地址是在构建时写入的。修改 `FIGMA_AUTO_BRIDGE_WS_URL` / `FIGMA_AUTO_BRIDGE_HTTP_URL` 后要重新构建插件。

### 本地开发为什么推荐 `localhost`

Figma 本地插件的 `devAllowedDomains` 对 `127.0.0.1` 不稳定，当前项目默认按 `localhost` 生成本地开发配置。
