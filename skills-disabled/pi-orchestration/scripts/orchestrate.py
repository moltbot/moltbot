# /// script
# requires-python = ">=3.11"
# dependencies = ["click"]
# ///
"""Orchestrate AI model workers via Pi Coding Agent."""

import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import click

DATA_DIR = Path(__file__).parent.parent / "data"
WORKERS_FILE = DATA_DIR / "workers.json"

PROVIDERS = {
    "glm": {"model": "glm-4.7", "env": "GLM_API_KEY"},
    "minimax": {"model": "MiniMax-M2.1", "env": "MINIMAX_API_KEY"},
    "openai": {"model": "gpt-4o", "env": "OPENAI_API_KEY"},
    "anthropic": {"model": "claude-sonnet-4-20250514", "env": "ANTHROPIC_API_KEY"},
}


def load_workers() -> dict:
    """Load worker state."""
    if not WORKERS_FILE.exists():
        return {"workers": []}
    try:
        return json.loads(WORKERS_FILE.read_text())
    except (json.JSONDecodeError, IOError):
        return {"workers": []}


def save_workers(data: dict) -> None:
    """Save worker state."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    WORKERS_FILE.write_text(json.dumps(data, indent=2))


def check_provider(provider: str) -> bool:
    """Check if provider is configured."""
    if provider not in PROVIDERS:
        return False
    env_var = PROVIDERS[provider]["env"]
    return bool(os.environ.get(env_var))


@click.group()
def cli():
    """Orchestrate AI model workers."""
    pass


@cli.command()
def providers():
    """List available providers and their status."""
    click.echo("Available providers:\n")
    for name, config in PROVIDERS.items():
        env_var = config["env"]
        configured = "✅" if os.environ.get(env_var) else "❌"
        click.echo(f"  {configured} {name:12} model={config['model']:20} env={env_var}")


@cli.command()
@click.option("--provider", "-p", default="glm", help="AI provider (glm, minimax, openai, anthropic)")
@click.option("--model", "-m", help="Override model name")
@click.option("--task", "-t", required=True, help="Task description")
@click.option("--session", "-s", help="tmux session name (auto-generated if not provided)")
@click.option("--background", "-b", is_flag=True, help="Run in background tmux session")
def spawn(provider: str, model: str, task: str, session: str, background: bool):
    """Spawn a worker with a task."""
    if provider not in PROVIDERS:
        click.echo(f"❌ Unknown provider: {provider}")
        click.echo(f"   Available: {', '.join(PROVIDERS.keys())}")
        sys.exit(1)
    
    if not check_provider(provider):
        env_var = PROVIDERS[provider]["env"]
        click.echo(f"❌ {provider} not configured. Set {env_var}")
        sys.exit(1)
    
    model_name = model or PROVIDERS[provider]["model"]
    session_name = session or f"worker-{provider}-{datetime.now().strftime('%H%M%S')}"
    
    cmd = f'pi --provider {provider} --model {model_name} -p "{task}"'
    
    if background:
        # Create tmux session and run command
        subprocess.run(["tmux", "new-session", "-d", "-s", session_name], check=False)
        subprocess.run(["tmux", "send-keys", "-t", session_name, cmd, "Enter"], check=True)
        
        # Track worker
        data = load_workers()
        data["workers"].append({
            "session": session_name,
            "provider": provider,
            "model": model_name,
            "task": task[:100],
            "started": datetime.now().isoformat(),
            "status": "running",
        })
        save_workers(data)
        
        click.echo(f"✅ Spawned worker in tmux session: {session_name}")
        click.echo(f"   Provider: {provider} / {model_name}")
        click.echo(f"   Task: {task[:60]}...")
        click.echo(f"\n   Check: tmux attach -t {session_name}")
    else:
        # Run directly
        click.echo(f"Running: {cmd}\n")
        os.system(cmd)


@cli.command()
def status():
    """Check status of all workers."""
    data = load_workers()
    workers = data.get("workers", [])
    
    if not workers:
        click.echo("No workers spawned")
        return
    
    click.echo(f"Workers ({len(workers)}):\n")
    
    for w in workers:
        session = w["session"]
        
        # Check if tmux session exists
        result = subprocess.run(
            ["tmux", "has-session", "-t", session],
            capture_output=True
        )
        alive = result.returncode == 0
        status_icon = "🟢" if alive else "⚫"
        
        click.echo(f"  {status_icon} {session}")
        click.echo(f"     Provider: {w['provider']} / {w['model']}")
        click.echo(f"     Task: {w['task'][:50]}...")
        click.echo(f"     Started: {w['started'][:19]}")
        click.echo()


@cli.command()
@click.option("--session", "-s", help="Specific session to collect from")
@click.option("--all", "collect_all", is_flag=True, help="Collect from all workers")
@click.option("--output", "-o", help="Output file")
def collect(session: str, collect_all: bool, output: str):
    """Collect output from worker(s)."""
    data = load_workers()
    workers = data.get("workers", [])
    
    if session:
        sessions = [session]
    elif collect_all:
        sessions = [w["session"] for w in workers]
    else:
        click.echo("Specify --session or --all")
        return
    
    results = []
    
    for sess in sessions:
        result = subprocess.run(
            ["tmux", "capture-pane", "-t", sess, "-p"],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            results.append(f"=== {sess} ===\n{result.stdout}\n")
            click.echo(f"✅ Collected from {sess}")
        else:
            click.echo(f"❌ Failed to collect from {sess}")
    
    if output:
        Path(output).write_text("\n".join(results))
        click.echo(f"\nSaved to {output}")
    else:
        click.echo("\n" + "\n".join(results))


@cli.command()
@click.option("--session", "-s", help="Specific session to kill")
@click.option("--all", "kill_all", is_flag=True, help="Kill all workers")
def kill(session: str, kill_all: bool):
    """Kill worker session(s)."""
    data = load_workers()
    workers = data.get("workers", [])
    
    if session:
        sessions = [session]
    elif kill_all:
        sessions = [w["session"] for w in workers]
    else:
        click.echo("Specify --session or --all")
        return
    
    for sess in sessions:
        result = subprocess.run(["tmux", "kill-session", "-t", sess], capture_output=True)
        if result.returncode == 0:
            click.echo(f"✅ Killed {sess}")
        else:
            click.echo(f"⚠️  {sess} not found or already killed")
    
    # Clean up worker list
    if kill_all:
        data["workers"] = []
    else:
        data["workers"] = [w for w in workers if w["session"] not in sessions]
    save_workers(data)


@cli.command()
@click.argument("tasks", nargs=-1, required=True)
@click.option("--provider", "-p", default="glm", help="AI provider")
@click.option("--model", "-m", help="Model name")
def parallel(tasks: tuple, provider: str, model: str):
    """Spawn multiple workers in parallel."""
    if not check_provider(provider):
        env_var = PROVIDERS[provider]["env"]
        click.echo(f"❌ {provider} not configured. Set {env_var}")
        sys.exit(1)
    
    model_name = model or PROVIDERS[provider]["model"]
    
    click.echo(f"Spawning {len(tasks)} workers with {provider}/{model_name}:\n")
    
    for i, task in enumerate(tasks, 1):
        session_name = f"parallel-{i}-{datetime.now().strftime('%H%M%S')}"
        cmd = f'pi --provider {provider} --model {model_name} -p "{task}"'
        
        subprocess.run(["tmux", "new-session", "-d", "-s", session_name], check=False)
        subprocess.run(["tmux", "send-keys", "-t", session_name, cmd, "Enter"], check=True)
        
        data = load_workers()
        data["workers"].append({
            "session": session_name,
            "provider": provider,
            "model": model_name,
            "task": task[:100],
            "started": datetime.now().isoformat(),
            "status": "running",
        })
        save_workers(data)
        
        click.echo(f"  ✅ Worker {i}: {session_name}")
        click.echo(f"     Task: {task[:50]}...")
    
    click.echo(f"\nUse 'orchestrate.py status' to check progress")
    click.echo(f"Use 'orchestrate.py collect --all' to gather results")


if __name__ == "__main__":
    cli()
