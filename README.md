# Claude Code Router (CCR) Settings

一个用于管理 Claude Code Router 配置的 VS Code 扩展插件，提供图形化界面来配置和管理 CCR 的各项设置。

## 功能特性

### 🎯 核心功能

1. **图形化配置界面**
   - 提供可视化的设置面板，无需手动编辑配置文件
   - 实时预览和编辑配置更改

2. **模型路由管理**
   - **默认模型**: 用于常规对话的模型
   - **思考模型**: 用于复杂推理和分析的模型
   - **长上下文模型**: 用于处理大量上下文的模型
   - **后台任务模型**: 用于后台运行的任务
   - **网络搜索模型**: 用于网络搜索功能的模型
   - **图像模型**: 用于图像处理的模型

3. **提供商管理**
   - 支持多个 AI 服务提供商（OpenAI、Anthropic、本地模型等）
   - 自动获取可用模型列表
   - 手动添加自定义模型

4. **快速切换模型**
   - 命令面板快速切换各个路由的模型
   - 一键批量设置多个路由使用同一模型
   - 实时重启 CCR 服务

5. **配置文件管理**
   - 直接打开 CCR 配置文件
   - 直接打开 Claude Code 设置文件

6. **Transformers 插件支持**
   - 配置和使用 Transformers 插件
   - 支持多个插件实例

## 配置选项

### 基础配置

| 配置项 | 描述 | 默认值 |
|--------|------|--------|
| 启用日志 | 是否启用日志记录 | true |
| 日志级别 | 日志输出级别 | warn |
| 服务器地址 | CCR 服务器地址 | 127.0.0.1 |
| 服务器端口 | CCR 服务器端口 | 3456 |
| API 密钥 | API 认证密钥 | 空 |
| API 超时(ms) | API 请求超时时间 | 600000 |
| 代理 URL | 网络代理地址 | 空 |
| Claude 路径 | Claude 可执行文件路径 | 空 |

### 模型路由配置

每个路由可以指定不同的模型，具体包括：

- **default**: 默认对话模型
- **think**: 思考推理模型
- **longContext**: 长上下文模型（支持 100K+ tokens）
- **background**: 后台任务模型
- **webSearch**: 网络搜索模型
- **image**: 图像处理模型

### 提供商配置

每个提供商包含以下信息：
- **名称**: 提供商标识符（如 openai、anthropic）
- **API 基础地址**: API 接口地址
- **API 密钥**: 认证密钥
- **模型列表**: 支持的模型列表

### Transformers 配置

支持配置多个 Transformers 插件：
- **插件路径**: 插件文件路径
- **插件选项**: 插件配置参数

## 使用方法

### 1. 安装插件

在 VS Code 中搜索 "claude-code-router Settings" 并安装。

### 2. 打开设置面板

使用命令面板（Ctrl+Shift+P）执行以下命令之一：

- `ccr: Open Settings Panel` - 打开图形化设置面板
- `ccr: Open CCR config.json` - 直接打开 CCR 配置文件
- `ccr: Open CC settings.json` - 直接打开 Claude Code 设置文件

### 3. 添加提供商

1. 在设置面板中点击"添加新的提供商"
2. 输入提供商名称（如 openai）
3. 输入 API 基础地址
4. 输入 API 密钥
5. 输入支持的模型列表，或点击"获取模型"自动获取

### 4. 配置模型路由

1. 在"路由配置"部分，点击每个路由的下拉菜单
2. 选择对应的模型（格式：提供商名,模型名）
3. 点击"保存配置"并重启 CCR

### 5. 快速切换模型

使用命令面板执行以下命令：

- `ccr: Quick Switch Default、Think、Long Context、Background Model` - 一键设置四个主要路由
- `ccr: Switch Default Model` - 切换默认模型
- `ccr: Switch Think Model` - 切换思考模型
- `ccr: Switch Long Context Model` - 切换长上下文模型
- `ccr: Switch Background Model` - 切换后台任务模型
- `ccr: Switch Web Search Model` - 切换网络搜索模型
- `ccr: Switch Image Model` - 切换图像模型

### 6. 重启 CCR

- `ccr: Restart CCR` - 重启 CCR 服务

## 配置文件路径

插件默认的配置文件路径：

### Windows
- CCR 配置文件: `%USERPROFILE%\.claude-code-router\config.json`
- Claude Code 设置: `%USERPROFILE%\.claude\settings.json`

### Linux/Mac
- CCR 配置文件: `/root/.claude-code-router/config.json`
- Claude Code 设置: `/root/.claude/settings.json`

### 自定义路径
可以通过 VS Code 设置自定义配置文件路径：

```json
{
    "ccr.ccrConfigPath": "自定义 CCR 配置文件路径",
    "ccr.ccSettingsPath": "自定义 Claude Code 设置路径"
}
```

## 高级功能

### 模型自动获取
插件可以自动从 API 获取可用的模型列表，确保配置的模型名称正确。

### 实时配置同步
配置更改后会自动同步到配置文件，并可以立即重启 CCR 应用更改。

### 错误处理
提供详细的错误提示和日志输出，帮助诊断配置问题。

## 注意事项

1. 确保 Claude Code Router 已正确安装并运行
2. 首次使用时，插件会自动创建默认配置文件
3. 修改配置后需要重启 CCR 才能生效
4. 网络搜索和图像功能需要相应的模型支持

## 开发信息

- **支持平台**: Windows, Linux, macOS
- **VSCode 版本要求**: ^1.85.0
- **依赖**: TypeScript, ESLint, Webpack

## 贡献

欢迎提交 Issue 和 Pull Request 来改进这个插件。
