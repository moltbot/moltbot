---
name: pi-orchestration
description: Orchestrate multiple AI models (GLM, MiniMax, etc.) as workers using Pi Coding Agent with Claude as coordinator.
homepage: https://github.com/mariozechner/pi-coding-agent
metadata: {"clawdis":{"emoji":"🎭","requires":{"bins":["pi"]}}}
---

# Pi Orchestration

Use Claude as an orchestrator to spawn and coordinate multiple AI model workers (GLM, MiniMax, etc.) via Pi Coding Agent.

## Supported Providers

| Provider | Model | Status |
|----------|-------|--------|
| **GLM** | glm-4.7 | ✅ Working |
| **MiniMax** | MiniMax-M2.1 | ✅ Working |
| OpenAI | gpt-4o, etc. | ✅ Working |
| Anthropic | claude-* | ✅ Working |

## Setup

### 1. GLM (Zhipu AI)

Get API key from [open.bigmodel.cn](https://open.bigmodel.cn/)

```bash
export GLM_API_KEY="your-glm-api-key"
```

### 2. MiniMax

Get API key from [api.minimax.chat](https://api.minimax.chat/)

```bash
export MINIMAX_API_KEY="your-minimax-api-key"
export MINIMAX_GROUP_ID="your-group-id"  # Required for MiniMax
```

## Usage

### Direct Commands

```bash
# GLM-4.7
pi --provider glm --model glm-4.7 -p "Your task"

# MiniMax M2.1
pi --provider minimax --model MiniMax-M2.1 -p "Your task"

# Test connectivity
pi --provider glm --model glm-4.7 -p "Say hello"
```

### Orchestration Patterns

Claude (Opus) can spawn these as background workers:

#### Background Worker
```bash
bash workdir:/tmp/task background:true command:"pi --provider glm --model glm-4.7 -p 'Build feature X'"
```

#### Parallel Army (tmux)
```bash
# Create worker sessions
tmux new-session -d -s worker-1
tmux new-session -d -s worker-2

# Dispatch tasks
tmux send-keys -t worker-1 "pi --provider glm --model glm-4.7 -p 'Task 1'" Enter
tmux send-keys -t worker-2 "pi --provider minimax --model MiniMax-M2.1 -p 'Task 2'" Enter

# Check progress
tmux capture-pane -t worker-1 -p
tmux capture-pane -t worker-2 -p
```

#### Map-Reduce Pattern
```bash
# Map: Distribute subtasks to workers
for i in 1 2 3; do
  tmux send-keys -t worker-$i "pi --provider glm --model glm-4.7 -p 'Process chunk $i'" Enter
done

# Reduce: Collect and combine results
for i in 1 2 3; do
  tmux capture-pane -t worker-$i -p >> /tmp/results.txt
done
```

## Orchestration Script

```bash
# Quick orchestration helper
uv run {baseDir}/scripts/orchestrate.py spawn --provider glm --model glm-4.7 --task "Build a REST API"
uv run {baseDir}/scripts/orchestrate.py status
uv run {baseDir}/scripts/orchestrate.py collect
```

## Best Practices

1. **Task Decomposition**: Break large tasks into independent subtasks
2. **Model Selection**: Use GLM for Chinese content, MiniMax for creative tasks
3. **Error Handling**: Check worker status before collecting results
4. **Resource Management**: Clean up tmux sessions after completion

## Example: Parallel Code Review

```bash
# Claude orchestrates 3 workers to review different files
tmux send-keys -t worker-1 "pi --provider glm -p 'Review auth.py for security issues'" Enter
tmux send-keys -t worker-2 "pi --provider minimax -p 'Review api.py for performance'" Enter  
tmux send-keys -t worker-3 "pi --provider glm -p 'Review db.py for SQL injection'" Enter

# Wait and collect
sleep 30
for i in 1 2 3; do
  echo "=== Worker $i ===" >> review.md
  tmux capture-pane -t worker-$i -p >> review.md
done
```

## Notes

- Pi Coding Agent must be installed: `npm install -g @anthropic/pi-coding-agent`
- GLM and MiniMax have generous free tiers
- Claude acts as coordinator, workers do the heavy lifting
- Combine with process tool for background task management
