# azure-board-mcp

MCP server for [Azure DevOps Boards](https://learn.microsoft.com/en-us/azure/devops/boards/) work items (stdio transport). Use it from [Cursor](https://cursor.com), [Claude Desktop](https://claude.ai/download), or any MCP host that supports local stdio servers.

**Requires [Bun](https://bun.sh)** (the CLI runs TypeScript via the `bun` shebang).

## Prerequisites

1. **Bun** — install from [bun.sh](https://bun.sh/docs/installation).
2. **Azure DevOps** — an organization, a project, and a **Personal Access Token** with at least **Work Items: Read & write** (or the scopes you need for your tools).

## Environment variables

| Variable        | Description                                                  |
| --------------- | ------------------------------------------------------------ |
| `AZURE_ORG`     | Azure DevOps organization name (URL segment, e.g. `contoso`) |
| `AZURE_PROJECT` | Project name                                                 |
| `AZURE_PAT`     | PAT string (keep secret)                                     |

You can set them in the shell, in a `.env` file next to the project (Bun loads it), or in **`~/.config/azure-boards-mcp/.env`** (one key per line: `KEY=value`). Values already set in the environment are not overwritten by the config file.

## Option A — Run from a clone (development)

```bash
git clone https://github.com/broisnischal/azure-mcp.git
cd azure-mcp
bun install
export AZURE_ORG=your-org
export AZURE_PROJECT=your-project
export AZURE_PAT=your-pat
bun run src/index.ts
```

Or use the package script:

```bash
bun run start
```

## Option B — Install from npm

After the package is published:

```bash
export AZURE_ORG=your-org
export AZURE_PROJECT=your-project
export AZURE_PAT=your-pat
bunx azure-board-mcp@1.0.0
```

Global install (optional):

```bash
npm install -g azure-board-mcp
azure-boards-mcp
```

## Cursor (`~/.cursor/mcp.json` or project `.cursor/mcp.json`)

Add a stdio server entry. Replace the placeholders with your org, project, and PAT (or use `${env:AZURE_PAT}` and export the variable in your environment).

```json
{
  "mcpServers": {
    "azure-boards": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/azure-mcp/src/index.ts"],
      "env": {
        "AZURE_ORG": "your-org",
        "AZURE_PROJECT": "your-project",
        "AZURE_PAT": "your-pat"
      }
    }
  }
}
```

Using the published package instead of a local path:

```json
{
  "mcpServers": {
    "azure-boards": {
      "command": "bunx",
      "args": ["azure-board-mcp@1.0.0"],
      "envFile": "${userHome}/.config/azure-boards-mcp/.env"
    }
  }
}

or

{
"io.github.broisnischal/azure-mcp": {
      "command": "bunx",
      "args": ["azure-board-mcp@1.0.0"],
      "env": {
        "AZURE_ORG": "Your Azure Organization",
        "AZURE_PROJECT": "azure specific project",
        "AZURE_PAT": "your pat"
      }
    }
}
```

Restart Cursor after editing MCP config.

## Claude Desktop

Edit the MCP config file ([Claude docs](https://modelcontextprotocol.io/quickstart/user)) and add a similar `command` / `args` / `env` block under `mcpServers`.

## MCP Registry

Server id: `io.github.broisnischal/azure-mcp`. Discovery metadata is on the [Model Context Protocol Registry](https://modelcontextprotocol.io/registry); the runnable artifact is the **npm** package `azure-board-mcp`.

## License

MIT
