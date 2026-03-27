#!/usr/bin/env bun
// ─── Azure Boards MCP Server ──────────────────────────────────────────────────
//
//  Usage (stdio transport — for Claude Desktop / Claude Code):
//    $ bun run src/index.ts
//    $ azure-boards-mcp           ← after `bun link`
//
//  Env vars (or .env file):
//    AZURE_ORG      — your Azure DevOps org name
//    AZURE_PROJECT  — project name
//    AZURE_PAT      — Personal Access Token (Work Items: Read & Write)
//

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AzureDevOpsClient } from "./client.ts";
import { TOOLS, handleTool } from "./tools.js";

// ── Config ────────────────────────────────────────────────────────────────────

async function loadEnvFromConfigFile(): Promise<void> {
  const home = process.env["HOME"];
  if (!home) return;

  const path = `${home}/.config/azure-boards-mcp/.env`;
  const file = Bun.file(path);
  if (!(await file.exists())) return;

  const raw = await file.text();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;

    const key = trimmed.slice(0, idx).trim();
    if (!key || process.env[key]) continue;

    process.env[key] = trimmed.slice(idx + 1).trim();
  }
}

async function loadConfig() {
  await loadEnvFromConfigFile();

  // Support .env file automatically via Bun
  const org = process.env["AZURE_ORG"];
  const project = process.env["AZURE_PROJECT"];
  const pat = process.env["AZURE_PAT"];

  const missing = (["AZURE_ORG", "AZURE_PROJECT", "AZURE_PAT"] as const).filter(
    (k) => !process.env[k],
  );

  if (missing.length > 0) {
    console.error(
      `\n❌ Missing required environment variables: ${missing.join(", ")}`,
    );
    console.error(`
Set them via .env or shell:

  export AZURE_ORG=my-org
  export AZURE_PROJECT=my-project
  export AZURE_PAT=<your PAT token>

Or add to ~/.config/azure-boards-mcp/.env
`);
    process.exit(1);
  }

  return { org: org!, project: project!, pat: pat! };
}

// ── Server ────────────────────────────────────────────────────────────────────

async function main() {
  const cfg = await loadConfig();
  const client = new AzureDevOpsClient(cfg);

  const server = new Server(
    {
      name: "azure-boards-mcp",
      version: "1.0.0",
    },
    {
      capabilities: { tools: {} },
    },
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    return handleTool(client, name, args as Record<string, unknown>);
  });

  // Connect via stdio (standard MCP transport)
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stderr only — stdout is reserved for MCP protocol messages
  console.error(
    `✅ Azure Boards MCP running (org: ${cfg.org} / project: ${cfg.project})`,
  );
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
