# OpenClaw 国际化 (i18n) 指南

此目录包含 OpenClaw 国际化的核心逻辑和翻译文件。

## 核心设计理念

### 逻辑零侵入

i18n 层纯粹是 UI 包装器，不会修改任何底层业务逻辑或命令执行流程。

### 无缝迁移

现有代码无需大规模重构。`t()` 函数在未找到对应翻译时会原样返回 Key 值，确保 100% 的向下兼容性。

### 稳健回退

如果目标语言中缺少某个键值，系统会自动回退到英文（默认）字符串，保证界面不会出现空白。

## 工作原理

OpenClaw 采用轻量级的 JSON 翻译系统：

1. **环境检测**：检查系统的 `LANG` 或 `LC_ALL` 环境变量。
2. **匹配查找**：在 `src/i18n/locales/` 目录下查找对应语言的 JSON 文件并匹配键值。
3. **界面渲染**：将翻译后的文本注入到 TUI 或 CLI 输出中。

## 如何使用

通过设置环境变量来改变 OpenClaw 的显示语言：

### Bash

```bash
# 以中文模式运行
LANG=zh_CN openclaw onboarding

# 以英文模式运行 (默认)
openclaw onboarding
```

## 如何贡献新语言

1. 将 `locales/en.json` 复制并重命名为 `locales/<语言代码>.json`。
2. 翻译 Value 部分，保持 Key 与英文原版一致。
3. 提交 Pull Request 即可！
