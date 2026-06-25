---
name: azure-mcp
description: Configure and use the Azure DevOps MCP server (azure-board-mcp) with Claude Code. Use when working with Azure DevOps work items, sprints, builds, pull requests, pipelines, taskboard, backlog, bugs, or when the user mentions Azure Boards, ADO, WIQL, or Azure DevOps.
---

# Azure DevOps MCP

30-tool MCP server for Azure DevOps: work items, backlog, boards, sprints, repos, PRs, builds, and releases over stdio.  
Installable via `npx` or `bunx` — no clone required.

## Install & authenticate

```bash
# OAuth — opens browser for Microsoft sign-in (default, no setup needed)
npx azure-board-mcp authenticate

# PAT — for CI or environments where browser sign-in isn't available
npx azure-board-mcp authenticate --pat

# Verify stored credentials
npx azure-board-mcp check

# Logout
npx azure-board-mcp logout
```

Both flows fetch all available projects after sign-in and let you pick from a numbered list — no typing project names.  
Credentials are stored at `~/.azure-mcp-auth.json`.

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

## Available tools (30)

Work-item, commit, and PR lists are **paginated** (default page 15, max 50) and
report `Showing X–Y of N`; pass `skip` to page through rather than a large `top`.

| Tool | What it does |
|---|---|
| `auth_status` | Validate credentials and check PAT scopes |
| `switch_project` | List projects / set the active one |
| `list_work_items` | List/filter work items (mine, sprint, state, keyword) |
| `get_work_item` | Full detail: description, acceptance criteria, repro steps, comments, linked PRs/commits/builds |
| `create_work_item` | Create any work item type |
| `update_work_item` | Update fields or append a comment |
| `add_comment` | Post a discussion comment |
| `link_work_items` | Parent/child, related, dependency links |
| `query_wiql` | Raw WIQL for custom queries |
| `get_work_item_history` | Audit trail — which fields changed, when, by whom |
| `get_backlog` | Ordered, priority-ranked backlog |
| `get_sprint` / `list_sprints` | Sprint dates and team capacity |
| `get_board` | Kanban columns, state mappings, WIP limits |
| `list_team_members` | Team roster (names, emails, admin flag) |
| `list_paths` | Valid area / iteration path values |
| `list_repos` / `list_files` / `get_file` | Browse repositories and files |
| `list_commits` | Recent commits on a branch |
| `list_pull_requests` | List PRs with reviewer votes |
| `create_pr` | Open a PR with reviewers + linked work items |
| `list_pipelines` / `list_builds` / `run_pipeline` | CI/CD pipelines and builds |
| `get_build_timeline` | Which stage/job/task failed |
| `get_build_logs` | Build output for diagnosing failures |
| `cancel_build` | Cancel an in-progress build |
| `list_releases` / `create_release` | Release status and triggering |

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
