# azure-board-mcp

MCP server for [Azure DevOps](https://azure.microsoft.com/en-us/products/devops). Work with tasks, sprints, bugs, pull requests, repositories, and pipelines directly from Claude, Cursor, or any MCP-compatible AI.

---

## Quick start

```bash
# 1. Configure your editors (Claude Code, Cursor, VS Code, Claude Desktop)
npx azure-board-mcp install

# 2. Sign in once
npx azure-board-mcp authenticate

# 3. Restart your editor — done
```

On first use the AI will ask which Azure DevOps project to work on and remember it.

---

## Install & authenticate

### Browser sign-in (default)

```bash
npx azure-board-mcp authenticate
```

Opens your browser for Microsoft sign-in. Picks your org from a list. No Azure AD app setup required — uses a shared app registration built into the package.

### PAT — Personal Access Token

For headless / CI environments or orgs that block third-party OAuth:

```bash
npx azure-board-mcp authenticate --pat
```

Create a PAT at `https://dev.azure.com/{org}/_usersSettings/tokens` with scopes: **Work Items (Read & Write)**, **Build (Read)**, **Code (Read)**.

---

## Editor setup

### Option A — automatic (recommended)

```bash
npx azure-board-mcp install
```

Detects and configures Claude Code, Cursor, VS Code, and Claude Desktop automatically.

### Option B — manual

**Claude Code** (`~/.claude/settings.json`):
```json
{
  "mcpServers": {
    "azure": {
      "command": "npx",
      "args": ["-y", "azure-board-mcp@latest"]
    }
  }
}
```

**Cursor** (`~/.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "azure": {
      "command": "npx",
      "args": ["-y", "azure-board-mcp@latest"]
    }
  }
}
```

**VS Code** (User `settings.json`):
```json
{
  "mcp": {
    "servers": {
      "azure": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "azure-board-mcp@latest"]
      }
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "azure": {
      "command": "npx",
      "args": ["-y", "azure-board-mcp@latest"]
    }
  }
}
```

---

## Claude Code skill

Install a skill so Claude automatically knows when to use this MCP:

```bash
npx azure-board-mcp skills
```

This installs `~/.claude/skills/azure-board-mcp/SKILL.md`. After restarting Claude Code, it will proactively use Azure DevOps tools whenever you ask about tasks, sprints, PRs, builds, etc.

---

## CLI reference

```
npx azure-board-mcp <command>

COMMANDS
  install               Auto-configure MCP in detected editors
  skills                Install the Claude Code skill
  authenticate          Browser OAuth sign-in
  authenticate --pat    Personal Access Token sign-in
  check                 Validate stored credentials
  logout                Clear stored credentials
  help                  Show help

AUTHENTICATE FLAGS
  --pat                 Use PAT instead of browser OAuth
  --read-only           Request read-only OAuth scopes
  --client-id <id>      Use your own Azure AD app
  --tenant-id <id>      Specify tenant (single-tenant apps only)
```

---

## Tools (21)

### Auth & project
| Tool | When to use |
|---|---|
| `auth_status` | Diagnose auth issues, check which project is active |
| `switch_project` | Change the active project, or list available ones |

### Work items
| Tool | When to use |
|---|---|
| `list_work_items` | My tasks, sprint board, filter by state/type/keyword |
| `get_work_item` | Full detail on a specific ticket — fields, comments, PRs |
| `create_work_item` | Create a task, bug, user story, epic, feature |
| `update_work_item` | Close, reassign, move sprint, update estimates |
| `add_comment` | Post a note or status update on a ticket |
| `link_work_items` | Set parent/child, related, or dependency links |
| `query_wiql` | Advanced queries with custom WIQL |

### Repositories
| Tool | When to use |
|---|---|
| `list_repos` | Discover repo names and URLs |
| `list_files` | Browse directory structure |
| `get_file` | Read file contents (up to 500 lines) |
| `list_commits` | Recent commits on a branch |
| `list_pull_requests` | Open PRs, reviewer votes, merge status |
| `create_pr` | Open a PR with optional reviewers and linked work items |

### Pipelines & builds
| Tool | When to use |
|---|---|
| `list_pipelines` | Discover pipeline definitions |
| `list_builds` | Recent builds — status, result, branch, link |
| `run_pipeline` | Trigger a pipeline run |
| `get_build_logs` | Diagnose build failures (last 150 lines) |

### Sprints
| Tool | When to use |
|---|---|
| `get_sprint` | Current sprint dates and team capacity |
| `list_sprints` | All sprints with start/end dates |

---

## Environment variables

Override stored credentials — useful for CI/Docker:

```bash
AZURE_ORG=my-org
AZURE_PROJECT=my-project
AZURE_PAT=my-pat        # PAT auth
AUTH_TOKEN=my-token     # OAuth bearer token
```

---

## Using your own Azure AD app

By default everyone shares the built-in app registration. If your org blocks it, or you need full control:

**1. Register the app**

1. [Azure Portal → App registrations → New registration](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps)
2. Name: anything (e.g. `azure-board-mcp`)
3. Supported account types: **"Any organizational directory"** (multitenant) or **"My organization only"**
4. Click **Register**

**2. Configure it**

In **Authentication**:
1. **Add a platform → Mobile and desktop applications** → check `http://localhost` → Configure
2. **Allow public client flows → Yes → Save**

In **API permissions**:
1. Add a permission → **APIs my organization uses** → search `Azure DevOps`
2. Select **`user_impersonation`** (delegated) → Add
3. Click **Grant admin consent** (optional — skips the per-user consent prompt)

**3. Use it**

```bash
npx azure-board-mcp authenticate --client-id <your-app-id>

# Single-tenant:
npx azure-board-mcp authenticate --client-id <your-app-id> --tenant-id <your-tenant-id>
```

**For org admins** — pre-approve for everyone in your org:

```
https://login.microsoftonline.com/{tenant-id}/adminconsent
  ?client_id=e2ba32e7-6d24-4919-ba7b-37199c495247
  &redirect_uri=http://localhost
```

---

## License

MIT
