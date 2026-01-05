---
name: ssh
description: SSH into remote hosts - run commands, transfer files, manage servers.
homepage: https://www.openssh.com/
metadata: {"clawdis":{"emoji":"🔐","requires":{"bins":["ssh","scp","rsync"]}}}
---

# SSH

Connect to and manage remote hosts via SSH.

## Configured Hosts

Define hosts in `~/.ssh/config` or document them in TOOLS.md:

```
# Example ~/.ssh/config
Host synology
    HostName 192.168.4.84
    User admin
    Port 22

Host mac-mini
    HostName 192.168.4.XX
    User dbhurley
    Port 22
```

## Common Commands

### Connect to Host
```bash
ssh <host>
# Example: ssh synology
```

### Run Command on Remote Host
```bash
ssh <host> "<command>"
# Example: ssh synology "docker ps"
# Example: ssh synology "df -h"
```

### Run Multiple Commands
```bash
ssh <host> "command1 && command2 && command3"
```

### Copy File TO Remote Host
```bash
scp /local/path/file.txt <host>:/remote/path/
# Example: scp backup.tar.gz synology:/volume1/backups/
```

### Copy File FROM Remote Host
```bash
scp <host>:/remote/path/file.txt /local/path/
# Example: scp synology:/volume1/logs/error.log ~/Desktop/
```

### Copy Directory (Recursive)
```bash
scp -r /local/folder <host>:/remote/path/
```

### Rsync (Better for Large Transfers)
```bash
rsync -avz --progress /local/path/ <host>:/remote/path/
rsync -avz --progress <host>:/remote/path/ /local/path/
```

### Port Forwarding (Local)
```bash
ssh -L <local_port>:<target_host>:<target_port> <jump_host>
# Example: Forward local 8080 to remote's localhost:80
ssh -L 8080:localhost:80 synology
```

### Port Forwarding (Remote)
```bash
ssh -R <remote_port>:localhost:<local_port> <host>
```

### SSH Tunnel (SOCKS Proxy)
```bash
ssh -D 1080 <host>
```

## System Administration

### Check Disk Space
```bash
ssh <host> "df -h"
```

### Check Memory
```bash
ssh <host> "free -h"
```

### Check Running Processes
```bash
ssh <host> "ps aux | head -20"
ssh <host> "top -bn1 | head -20"
```

### Check Docker Containers
```bash
ssh <host> "docker ps"
ssh <host> "docker ps -a"
ssh <host> "docker logs <container_name>"
```

### Restart Docker Container
```bash
ssh <host> "docker restart <container_name>"
```

### Check System Logs
```bash
ssh <host> "tail -100 /var/log/syslog"
ssh <host> "journalctl -n 50"
```

### Check Network
```bash
ssh <host> "netstat -tulpn"
ssh <host> "ss -tulpn"
```

## SSH Key Management

### Generate New Key
```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

### Copy Public Key to Host
```bash
ssh-copy-id <host>
```

### Test Connection
```bash
ssh -v <host> exit
```

## Notes

- Always use SSH keys instead of passwords when possible
- Add hosts to `~/.ssh/config` for easier access
- Use `-o StrictHostKeyChecking=no` only for trusted internal hosts
- For long-running commands, use `screen` or `tmux` on the remote host
- Document specific host details in TOOLS.md
