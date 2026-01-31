---
name: fork-manager
description: Manage forks with open PRs - sync upstream, rebase branches, track PR status, and maintain production branches with pending contributions.
metadata: {"moltbot":{"emoji":"🍴","os":["darwin","linux"],"requires":{"bins":["git","gh"]}}}
---

# Fork Manager Skill

Skill para gerenciar forks de repositórios onde você contribui com PRs mas também usa as melhorias antes de serem mergeadas no upstream.

## Quando usar

- Usuário pede para atualizar/sincronizar um fork
- Usuário quer saber status dos PRs abertos
- Usuário quer fazer rebase das branches de PR
- Usuário quer criar uma branch de produção com todos os PRs

## Configuração

Configs ficam em `~/.clawdbot/fork-manager/<repo-name>.json`:

```json
{
  "repo": "owner/repo",
  "fork": "your-user/repo", 
  "localPath": "/path/to/local/clone",
  "mainBranch": "main",
  "productionBranch": "main-with-all-prs",
  "upstreamRemote": "upstream",
  "originRemote": "origin",
  "openPRs": [123, 456],
  "prBranches": {
    "123": "fix/issue-123",
    "456": "feat/feature-456"
  },
  "lastSync": "2026-01-28T12:00:00Z"
}
```

## Fluxo de Análise

### 1. Carregar config

```bash
CONFIG_DIR=~/.clawdbot/fork-manager
cat "$CONFIG_DIR/<repo>.json"
```

### 2. Navegar para o repositório

```bash
cd <localPath>
```

### 3. Fetch de ambos remotes

```bash
git fetch <upstreamRemote>
git fetch <originRemote>
```

### 4. Analisar estado do main

```bash
# Commits que upstream tem e origin/main não tem
git log --oneline <originRemote>/<mainBranch>..<upstreamRemote>/<mainBranch>

# Contar commits atrás
git rev-list --count <originRemote>/<mainBranch>..<upstreamRemote>/<mainBranch>
```

### 5. Verificar PRs abertos via GitHub CLI

```bash
# Listar PRs abertos do usuário
gh pr list --state open --author @me --json number,title,headRefName,state

# Verificar status de um PR específico
gh pr view <number> --json state,mergedAt,closedAt,title
```

### 6. Classificar cada PR

Para cada PR no config, verificar:

| Estado | Condição | Ação |
|--------|----------|------|
| **open** | PR aberto no GitHub | Manter, verificar se precisa rebase |
| **merged** | PR foi mergeado | Remover do config, deletar branch local |
| **closed** | PR fechado sem merge | Verificar motivo, possivelmente remover |
| **conflict** | Branch tem conflitos com upstream | Precisa rebase manual |
| **outdated** | Branch está atrás do upstream | Precisa rebase |

Comando para verificar se branch precisa rebase:
```bash
git log --oneline <upstreamRemote>/<mainBranch>..<originRemote>/<branch> | wc -l  # commits à frente
git log --oneline <originRemote>/<branch>..<upstreamRemote>/<mainBranch> | wc -l  # commits atrás
```

## Comandos do Agente

### `status` - Verificar estado atual

1. Carregar config
2. Fetch remotes
3. Contar commits atrás do upstream
4. Listar PRs e seus estados
5. Reportar ao usuário

### `sync` - Sincronizar main com upstream

```bash
cd <localPath>
git fetch <upstreamRemote>
git checkout <mainBranch>
git merge <upstreamRemote>/<mainBranch>
git push <originRemote> <mainBranch>
```

### `rebase <branch>` - Rebase de uma branch específica

```bash
git checkout <branch>
git fetch <upstreamRemote>
git rebase <upstreamRemote>/<mainBranch>
# Se conflito: resolver e git rebase --continue
git push <originRemote> <branch> --force-with-lease
```

### `rebase-all` - Rebase de todas as branches de PR

Para cada branch em `prBranches`:
1. Checkout da branch
2. Rebase no upstream/main
3. Push com --force-with-lease
4. Reportar sucesso/falha

### `update-config` - Atualizar config com PRs atuais

```bash
# Buscar PRs abertos
gh pr list --state open --author @me --repo <repo> --json number,headRefName

# Atualizar o arquivo JSON com os PRs atuais
```

### `build-production` - Criar branch de produção com todos os PRs

```bash
cd <localPath>
git fetch <upstreamRemote>
git fetch <originRemote>

# Deletar branch antiga se existir
git branch -D <productionBranch> 2>/dev/null || true

# Criar nova branch a partir do upstream
git checkout -b <productionBranch> <upstreamRemote>/<mainBranch>

# Mergear cada PR branch
for branch in <prBranches>; do
  git merge <originRemote>/$branch -m "Merge PR #<number>: <title>"
  # Se conflito, resolver
done

# Push
git push <originRemote> <productionBranch> --force

# Build
bun run build
```

### `full-sync` - Sincronização completa

1. `sync` - Atualizar main
2. `update-config` - Atualizar lista de PRs
3. `rebase-all` - Rebase de todas as branches
4. `build-production` - Recriar branch de produção
5. `bun run build` - Rebuild

## Relatório para o Usuário

Após qualquer operação, gerar relatório:

```markdown
## 🍴 Fork Status: <repo>

### Upstream Sync
- **Main branch:** X commits behind upstream
- **Last sync:** <date>

### Open PRs (Y total)

| # | Branch | Status | Action Needed |
|---|--------|--------|---------------|
| 123 | fix/issue-123 | ✅ Up to date | None |
| 456 | feat/feature | ⚠️ Needs rebase | Run rebase |
| 789 | fix/bug | ❌ Has conflicts | Manual resolution |

### Production Branch
- **Branch:** main-with-all-prs
- **Contains:** PRs #123, #456, #789
- **Status:** ✅ Up to date / ⚠️ Needs rebuild

### Recommended Actions
1. ...
2. ...
```

## Notas Importantes

- Sempre usar `--force-with-lease` em vez de `--force` para push
- Sempre fazer backup antes de operações destrutivas
- Usar `bun run` em vez de `npm run`
- Verificar se há trabalho não commitado antes de operações git
- Manter o config atualizado após cada operação

## Exemplo de Uso

Usuário: "atualiza meu fork do claude-mem"

Agente:
1. Lê config de `~/.clawdbot/fork-manager/claude-mem.json`
2. Executa `status` para entender situação atual
3. Se main está atrás, executa `sync`
4. Se PRs precisam rebase, executa `rebase-all`
5. Atualiza `productionBranch` se necessário
6. Executa `bun run build`
7. Reporta resultado ao usuário
