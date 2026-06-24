# azure-board-mcp

MCP server for [Azure DevOps](https://learn.microsoft.com/en-us/azure/devops/) — work items, sprints, builds, and pull requests.

No local clone needed. Runs via `npx` or `bunx`. Credentials stored once, reused across sessions.

---

## Quick start

```bash
# 1. Authenticate (PAT — no Azure app registration required)
npx azure-board-mcp authenticate

# 2. Add to Claude Code
```

Add to `~/.claude/settings.json`:

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

Restart Claude Code. Done — ask Claude about your work items, sprints, or PRs.

---

## Authentication

### Option 1: PAT (recommended)

Personal Access Token — works immediately, no Azure AD setup needed.

```bash
npx azure-board-mcp authenticate
```

The wizard prompts for:
- **Organization** — the slug in `https://dev.azure.com/{org}`
- **Project** — your team project name
- **PAT** — paste your token

Credentials are validated immediately and stored at `~/.azure-mcp-auth.json` (mode 0600).

**Create a PAT at:** `https://dev.azure.com/{org}/_usersSettings/tokens`

Required scopes:

| Scope | Access |
|---|---|
| Work Items | Read & Write |
| Build | Read |
| Code | Read |

---

### Option 2: OAuth device code

For organisations that require Azure AD login instead of PATs.

Requires an Azure AD app registration with Azure DevOps `user_impersonation` permission.

```bash
# Full access (work items read/write + build + code)
AZURE_CLIENT_ID=<your-app-id> npx azure-board-mcp authenticate --oauth

# Read-only (work items + code, no build execute)
AZURE_CLIENT_ID=<your-app-id> npx azure-board-mcp authenticate --oauth --read-only
```

The command prints a device code and URL. Open the URL in a browser, enter the code, sign in, and the token is stored automatically.

**Register an app:**
1. Go to [Azure Portal → App registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps)
2. New registration → Public client (mobile/desktop) → any redirect URI
3. API permissions → Add → Azure DevOps → `user_impersonation` (delegated)
4. Enable "Allow public client flows" under Authentication

---

### Option 3: Environment variables (CI / Docker)

Set these and no stored credentials are needed:

```bash
# PAT mode
export AZURE_ORG=my-org
export AZURE_PROJECT=my-project
export AZURE_PAT=my-pat

# OAuth bearer mode (pre-issued token)
export AZURE_ORG=my-org
export AZURE_PROJECT=my-project
export AUTH_TOKEN=<microsoft-bearer-token>
```

Environment variables take priority over `~/.azure-mcp-auth.json`.

---

## CLI commands

| Command | Description |
|---|---|
| `npx azure-board-mcp authenticate` | PAT wizard — prompts, validates, saves |
| `npx azure-board-mcp authenticate --oauth` | OAuth device code flow |
| `npx azure-board-mcp authenticate --oauth --read-only` | OAuth with reduced scopes |
| `npx azure-board-mcp check` | Validate stored credentials |
| `npx azure-board-mcp logout` | Remove `~/.azure-mcp-auth.json` |
| `npx azure-board-mcp` | Start MCP server (used by Claude Code) |

---

## MCP config options

### npx (default)

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

### bunx

```json
{
  "mcpServers": {
    "azure": {
      "command": "bunx",
      "args": ["azure-board-mcp@latest"]
    }
  }
}
```

### Pin a version

```json
{
  "mcpServers": {
    "azure": {
      "command": "npx",
      "args": ["-y", "azure-board-mcp@1.1.0"]
    }
  }
}
```

### With environment variables (overrides stored auth)

```json
{
  "mcpServers": {
    "azure": {
      "command": "npx",
      "args": ["-y", "azure-board-mcp@latest"],
      "env": {
        "AZURE_ORG": "my-org",
        "AZURE_PROJECT": "my-project",
        "AZURE_PAT": "my-pat"
      }
    }
  }
}
```

---

## Tools

Nine tools are exposed to the AI — lean enough to stay fast, complete enough to work a real sprint.

### `auth_status`

Check that credentials are valid and which PAT scopes are active.

```
auth_status()
```

Returns per-scope pass/fail and a pointer to the token settings page if something is missing.

---

### `list_work_items`

List and filter work items. Combine any filters freely.

| Parameter | Type | Description |
|---|---|---|
| `mine` | boolean | Only items assigned to me |
| `sprint` | boolean | Only items in the current sprint |
| `state` | string | `Active` · `New` · `Resolved` · `Closed` · `Done` · `In Progress` |
| `type` | string | `Task` · `Bug` · `User Story` · `Epic` · `Feature` |
| `keyword` | string | Full-text search across title and description |
| `top` | number | Max results (default 20) |

```
# My open items in the current sprint
list_work_items(mine: true, sprint: true)

# All active bugs
list_work_items(type: "Bug", state: "Active")

# Search for anything about invoices
list_work_items(keyword: "invoice")
```

---

### `get_work_item`

Full detail for one work item.

| Parameter | Type | Description |
|---|---|---|
| `id` | number | Work item ID |

Returns everything on the Azure DevOps card:

- All fields: title, state, priority, assignment, area path, sprint, tags, story points, remaining/original/completed work
- Description, Acceptance Criteria, Repro Steps, System Info — HTML converted to readable markdown
- Linked work items: parent, children, related, predecessors/successors
- Development links: pull requests, commits, builds (from ArtifactLink relations)
- All discussion comments with author and timestamp
- **Inline images** — images embedded in the description or any other HTML field are downloaded and returned as image content blocks so the AI can see them directly

```
get_work_item(id: 1234)
```

---

### `create_work_item`

Create any work item type.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `type` | string | yes | `Task` · `Bug` · `User Story` · `Epic` · `Feature` · `Issue` |
| `title` | string | yes | |
| `description` | string | | Plain text or HTML |
| `assignedTo` | string | | Email or display name |
| `priority` | number | | `1` Critical · `2` High · `3` Medium · `4` Low |
| `state` | string | | Initial state, e.g. `New` or `Active` |
| `iterationPath` | string | | Sprint path, e.g. `MyProject\Sprint 3` |
| `areaPath` | string | | Area path, e.g. `MyProject\Backend` |
| `parentId` | number | | Link as child of this work item |
| `storyPoints` | number | | |
| `tags` | string | | Semicolon-separated |
| `acceptanceCriteria` | string | | |
| `reproSteps` | string | | Bug only |

```
create_work_item(
  type: "Bug",
  title: "Login button unresponsive on Safari",
  priority: 2,
  reproSteps: "1. Open Safari\n2. Click Login\n3. Nothing happens",
  assignedTo: "nischal.dahal@aitc.ai"
)
```

---

### `update_work_item`

Update one or more fields. Only supply what you want to change.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | number | yes | Work item ID |
| `title` | string | | |
| `state` | string | | `Active` · `Resolved` · `Closed` · `New` |
| `assignedTo` | string | | Email, display name, or empty string to unassign |
| `priority` | number | | |
| `iterationPath` | string | | Move to a different sprint |
| `areaPath` | string | | |
| `storyPoints` | number | | |
| `tags` | string | | Replaces all existing tags |
| `comment` | string | | Appends a discussion comment |

```
# Close a work item and leave a comment
update_work_item(id: 1234, state: "Closed", comment: "Deployed in v2.4.1")

# Move to next sprint
update_work_item(id: 1234, iterationPath: "MyProject\\Sprint 4")
```

---

### `add_comment`

Post a discussion comment without changing any other field.

| Parameter | Type | Required |
|---|---|---|
| `workItemId` | number | yes |
| `text` | string | yes |

```
add_comment(workItemId: 1234, text: "Reviewed — looks good to merge.")
```

---

### `query_wiql`

Run a raw [WIQL](https://learn.microsoft.com/en-us/azure/devops/boards/queries/wiql-syntax) query for anything `list_work_items` can't express.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `wiql` | string | yes | WIQL query string |
| `top` | number | | Max results (default 50) |

Supported macros: `@me`, `@CurrentIteration`, `@project`, `@today`

```
# Items tagged 'billing' that aren't closed
query_wiql("
  SELECT [System.Id] FROM WorkItems
  WHERE [System.TeamProject] = @project
    AND [System.Tags] CONTAINS 'billing'
    AND [System.State] <> 'Closed'
  ORDER BY [System.ChangedDate] DESC
")

# Everything changed by me in the last 7 days
query_wiql("
  SELECT [System.Id] FROM WorkItems
  WHERE [System.ChangedBy] = @me
    AND [System.ChangedDate] >= @today - 7
  ORDER BY [System.ChangedDate] DESC
")
```

---

### `list_builds`

List CI/CD build runs.

| Parameter | Type | Description |
|---|---|---|
| `pipelineId` | number | Filter by pipeline definition ID |
| `branch` | string | e.g. `refs/heads/main` or just `main` |
| `status` | string | `all` · `inProgress` · `completed` · `notStarted` |
| `result` | string | `succeeded` · `failed` · `canceled` · `partiallySucceeded` |
| `top` | number | Number of results (default 10) |

```
# Last 5 failed builds on main
list_builds(branch: "refs/heads/main", result: "failed", top: 5)

# What's running right now
list_builds(status: "inProgress")
```

---

### `list_pull_requests`

List pull requests in a repository.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `repo` | string | yes | Repository name or ID |
| `status` | string | | `active` (default) · `completed` · `abandoned` · `all` |

```
list_pull_requests(repo: "my-api")
list_pull_requests(repo: "my-api", status: "completed")
```

Returns: PR number, title, author, source → target branch, merge status, and each reviewer's vote (approved / rejected / pending).

---

## Caching

The server caches slow, rarely-changing API calls in memory for the lifetime of the MCP process:

| Data | TTL |
|---|---|
| User identity (`@me`) | 1 hour |
| Project info | 1 hour |
| Teams | 30 minutes |
| Current sprint | 5 minutes |
| Area / iteration paths | 1 hour |

Work item lists are not cached (always fresh). The cache is per-process — restarting the MCP server clears it.

---

## Install the Claude Code skill

The skill tells Claude Code when to use this server and how to construct effective queries.

```bash
# Copy to user-level skills (active in every project)
mkdir -p ~/.claude/skills
cp -r .claude/skills/azure-mcp ~/.claude/skills/
```

Then type `/azure-mcp` in Claude Code for guided setup and workflow examples.

---

## Publish to npm

```bash
bun run build          # bundles src/ → dist/index.js (~1.1 MB)
npm publish --access public
```

The `prepublishOnly` hook runs the build automatically, so `npm publish` alone works too.

---

## Package info

- npm: `azure-board-mcp`
- Binaries: `azure-mcp`, `azure-board-mcp`
- MCP server ID: `io.github.broisnischal/azure-mcp`
- Requires: Node.js ≥ 18

## License

MIT
