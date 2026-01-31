# OpenClaw Termux 快速入门指南

## 🎉 补丁完成！

OpenClaw 现在可以在 Termux 上运行了！

## 📋 已应用的补丁

### 1. 原生模块存根
- ✅ `@mariozechner/clipboard-android-arm64` - 已创建存根包
- ✅ 日志目录支持环境变量覆盖 (`CLAWDBOT_LOG_DIR`)

### 2. 创建的文件
```
termux-run.sh              # Termux 启动脚本
scripts/patch-termux.sh    # 自动补丁脚本
TERMUX.md                  # 详细文档
node_modules/@mariozechner/clipboard-android-arm64/  # 存根包
```

## 🚀 使用方法

### 基本命令

```bash
# 显示版本
./termux-run.sh --version

# 查看帮助
./termux-run.sh --help

# 运行诊断
./termux-run.sh doctor

# 配置向导
./termux-run.sh setup

# 配置网关
./termux-run.sh config set gateway.mode local
./termux-run.sh config set gateway.auth.token your-secret-token

# 启动网关
./termux-run.sh gateway run --port 18789
```

### 发送消息

```bash
# 发送消息
./termux-run.sh message send --to +1234567890 --message "Hello from Termux!"

# 运行 Agent
./termux-run.sh agent --message "What is the weather today?"
```

## ⚙️ 初始设置

### 1. 首次运行设置

```bash
# 运行设置向导
./termux-run.sh setup

# 或手动配置
./termux-run.sh config set gateway.mode local
./termux-run.sh config set gateway.auth.token my-secure-token
```

### 2. 配置模型提供商

```bash
# Anthropic Claude
./termux-run.sh config set models.providers.anthropic.apiKey sk-ant-...

# OpenAI
./termux-run.sh config set models.providers.openai.apiKey sk-...
```

### 3. 启动网关

```bash
./termux-run.sh gateway run --port 18789
```

## 📱 支持的频道

在 Termux 上可以正常使用：
- ✅ WhatsApp (Baileys)
- ✅ Telegram
- ✅ Discord
- ✅ Slack
- ✅ Signal
- ✅ WebChat

可能不支持的频道：
- ❌ iMessage (仅 macOS)
- ❌ Matrix (需要原生加密模块)
- ⚠️ Canvas (需要原生模块)

## 🔧 故障排除

### 问题：重新安装后缺少 clipboard 存根

```bash
bash scripts/patch-termux.sh
```

### 问题：权限错误

确保使用 `./termux-run.sh` 而不是直接运行 `pnpm openclaw`

### 问题：需要重新构建

```bash
pnpm build
```

## 📚 更多信息

查看完整文档：
- `TERMUX.md` - Termux 特定文档
- `README.md` - 项目说明
- `docs/` - 完整文档目录

## 🎯 下一步

1. 运行 `./termux-run.sh setup` 进行初始配置
2. 配置你的 AI 模型 API 密钥
3. 连接你想要的频道（WhatsApp/Telegram/Discord 等）
4. 启动网关并开始使用！

享受在 Android 上运行 OpenClaw！🦞
