---
name: azure-mcp
description: Configure and use the Azure DevOps MCP server (azure-board-mcp) with Claude Code. Use when working with Azure DevOps work items, sprints, builds, pull requests, pipelines, taskboard, backlog, bugs, or when the user mentions Azure Boards, ADO, WIQL, or Azure DevOps.
---

# Azure DevOps MCP

9-tool MCP server for Azure DevOps: work items, sprints, builds, and pull requests over stdio.  
Installable via `npx` or `bunx` — no clone required.

## Install & authenticate

```bash
# Step 1 — authenticate (PAT, no app registration needed)
npx azure-board-mcp authenticate

# OR — OAuth device code (requires AZURE_CLIENT_ID env var)
npx azure-board-mcp authenticate --oauth

# Verify
npx azure-board-mcp check

# Logout
npx azure-board-mcp logout
```

The PAT wizard prompts for org, project, and token, validates them, then stores credentials at `~/.azure-mcp-auth.json`.

**PAT required scopes:** Work Items (Read & Write) · Build (Read) · Code (Read)  
Create at: `https://dev.azure.com/{org}/_usersSettings/tokens`

### Env var override (CI/Docker)

```bash
export AZURE_ORG=your-org
export AZURE_PROJECT=your-project
export AZURE_PAT=your-pat   # or AUTH_TOKEN=<bearer> for OAuth
```

## Add to Claude Code

`~/.claude/settings.json`:

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

Or with bunx:

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

Credentials from `~/.azure-mcp-auth.json` are picked up automatically.

## Available tools (9)

| Tool | What it does |
|---|---|
| `auth_status` | Validate credentials and check PAT scopes |
| `list_work_items` | List/filter work items (mine, sprint, state, keyword) |
| `get_work_item` | Full detail: description, acceptance criteria, repro steps, comments, linked PRs/commits/builds |
| `create_work_item` | Create any work item type |
| `update_work_item` | Update fields or append a comment |
| `add_comment` | Post a discussion comment |
| `query_wiql` | Raw WIQL for custom queries |
| `list_builds` | List CI builds with status and URL |
| `list_pull_requests` | List PRs with reviewer votes |

## Common workflows

### Taskboard / sprint items

```
list_work_items(mine: true, sprint: true)
```

### Full work item context

`get_work_item(id)` returns everything visible on the Azure DevOps card:
- Description, acceptance criteria, repro steps, system info
- Tags, story points, estimates, remaining work
- Linked work items (parent, children, related, predecessors)
- Linked PRs, commits, and build artifacts
- All discussion comments with timestamps

### Search across the backlog

```
list_work_items(keyword: "invoice", state: "Active")
```

### Check failing builds

```
list_builds(result: "failed", top: 5)
```

### PRs for a repo

```
list_pull_requests(repo: "my-repo")
```

### Custom queries

```
query_wiql("SELECT [System.Id] FROM WorkItems WHERE [System.Tags] CONTAINS 'billing' AND [System.State] <> 'Closed' ORDER BY [System.ChangedDate] DESC")
```

## Tips

- `get_work_item` always fetches comments too — no need for a separate call.
- Linked PRs appear under "Development & Deployment" in the output.
- `query_wiql` supports `@me`, `@CurrentIteration`, `@project` macros.
- If permissions fail, run `auth_status` to see which scopes are missing.
